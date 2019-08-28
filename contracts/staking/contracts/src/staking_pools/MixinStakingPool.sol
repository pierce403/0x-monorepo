/*

  Copyright 2018 ZeroEx Intl.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

*/

pragma solidity ^0.5.9;
pragma experimental ABIEncoderV2;

import "@0x/contracts-utils/contracts/src/LibRichErrors.sol";
import "@0x/contracts-utils/contracts/src/LibSafeMath.sol";
import "../libs/LibStakingRichErrors.sol";
import "../libs/LibSignatureValidator.sol";
import "../libs/LibEIP712Hash.sol";
import "../interfaces/IStructs.sol";
import "../interfaces/IStakingEvents.sol";
import "../immutable/MixinConstants.sol";
import "../immutable/MixinStorage.sol";
import "./MixinStakingPoolRewardVault.sol";


/// @dev This mixin contains logic for staking pools.
/// A pool has a single operator and any number of delegators (members).
/// Any staker can create a pool, although at present it is only beneficial
/// for market makers to create staking pools. A market maker *must* create a
/// pool in order to receive fee-based rewards at the end of each epoch (see MixinExchangeFees).
/// Moreover, creating a staking pool leverages the delegated stake within the pool,
/// which is counted towards a maker's total stake when computing rewards. A market maker
/// can register any number of makerAddresses with their pool, and can incentivize delegators
/// to join their pool by specifying a fixed percentage of their fee-based rewards to be split amonst
/// the members of their pool. Any rewards set aside for members of the pool is divided based on
/// how much stake each member delegated.
///
/// Terminology:
/// "Pool Id"       - A unique id generated by this contract and assigned to each pool when it is created.
/// "Pool Operator" - The creator and operator of the pool.
/// "Pool Members"  - Members of the pool who opted-in by delegating to the pool.
/// "Market Makers" - Market makers on the 0x protocol.
///
/// How-To for Market Makers:
/// 1. Create a pool, specifying what percentage of rewards kept for yourself.
///     The remaining is divided among members of your pool.
/// 2. Add the addresses that you use to market make on 0x.
/// 3. Leverage the staking power of others by convincing them to delegate to your pool.
contract MixinStakingPool is
    IStakingEvents,
    MixinDeploymentConstants,
    MixinConstants,
    MixinStorage,
    MixinStakingPoolRewardVault
{
    using LibSafeMath for uint256;

    /// @dev Asserts that the sender is the operator of the input pool.
    /// @param poolId Pool sender must be operator of.
    modifier onlyStakingPoolOperator(bytes32 poolId) {
        address poolOperator = getStakingPoolOperator(poolId);
        if (msg.sender != poolOperator) {
            LibRichErrors.rrevert(LibStakingRichErrors.OnlyCallableByPoolOperatorError(
                msg.sender,
                poolOperator
            ));
        }

        _;
    }

    /// @dev Asserts that the sender is the operator of the input pool or the input maker.
    /// @param poolId Pool sender must be operator of.
    /// @param makerAddress Address of a maker in the pool.
    modifier onlyStakingPoolOperatorOrMaker(bytes32 poolId, address makerAddress) {
        address poolOperator = getStakingPoolOperator(poolId);
        if (msg.sender != poolOperator && msg.sender != makerAddress) {
            LibRichErrors.rrevert(
                LibStakingRichErrors.OnlyCallableByPoolOperatorOrMakerError(
                    msg.sender,
                    poolOperator,
                    makerAddress
                )
            );
        }

        _;
    }

    /// @dev Create a new staking pool. The sender will be the operator of this pool.
    /// Note that an operator must be payable.
    /// @param operatorShare The percentage of any rewards owned by the operator.
    /// @return poolId The unique pool id generated for this pool.
    function createStakingPool(uint8 operatorShare)
        external
        returns (bytes32 poolId)
    {
        // note that an operator must be payable
        address payable operatorAddress = msg.sender;

        // assign pool id and generate next id
        poolId = nextPoolId;
        nextPoolId = _computeNextStakingPoolId(poolId);

        // store metadata about this pool
        IStructs.Pool memory pool = IStructs.Pool({
            operatorAddress: operatorAddress,
            operatorShare: operatorShare
        });
        poolById[poolId] = pool;

        // register pool in reward vault
        _registerStakingPoolInRewardVault(poolId, operatorShare);

        // notify
        emit StakingPoolCreated(poolId, operatorAddress, operatorShare);
        return poolId;
    }

    function joinStakingPool(
        bytes32 poolId
    )
        external
    {
        // Is the maker already in a pool?
        address makerAddress = msg.sender;
        if (isMakerAssignedToStakingPool(makerAddress)) {
            LibRichErrors.rrevert(LibStakingRichErrors.MakerAddressAlreadyRegisteredError(
                makerAddress
            ));
        }

        pendingPoolJoinedByMakerAddress[makerAddress] = poolId;

        // notify
        emit PendingStakingPoolJoin(
            poolId,
            makerAddress
        );
    }

    /// @dev Adds a maker to a staking pool. Note that this is only callable by the pool operator.
    /// Note also that the maker must have previously called joinStakingPool.
    /// @param poolId Unique id of pool.
    /// @param makerAddress Address of maker.
    function addMakerToStakingPool(
        bytes32 poolId,
        address makerAddress
    )
        external
        onlyStakingPoolOperator(poolId)
    {
        // Is the maker already in a pool?
        if (isMakerAssignedToStakingPool(makerAddress)) {
            LibRichErrors.rrevert(LibStakingRichErrors.MakerAddressAlreadyRegisteredError(
                makerAddress
            ));
        }

        // Is the maker trying to join this pool?
        bytes32 pendingJoinPoolId = getPendingPoolJoinedByMaker(makerAddress);
        if (pendingJoinPoolId != poolId) {
            LibRichErrors.rrevert(LibStakingRichErrors.MakerNotPendingJoinError(
                makerAddress,
                pendingJoinPoolId,
                poolId
            ));
        }

        // Is the pool already full?
        if (getSizeOfStakingPool(poolId) == MAX_POOL_SIZE) {
            LibRichErrors.rrevert(LibStakingRichErrors.PoolIsFullError(poolId));
        }

        poolIdByMakerAddress[makerAddress] = poolId;
        makerAddressesByPoolId[poolId].push(makerAddress);
        pendingPoolJoinedByMakerAddress[makerAddress] = NIL_MAKER_ID;

        // notify
        emit MakerAddedToStakingPool(
            poolId,
            makerAddress
        );
    }

    /// @dev Removes a maker from a staking pool. Note that this is only callable by the pool operator or maker.
    /// Note also that the maker does not have to *agree* to leave the pool; this action is
    /// at the sole discretion of the pool operator.
    /// @param poolId Unique id of pool.
    /// @param makerAddress Address of maker.
    function removeMakerFromStakingPool(
        bytes32 poolId,
        address makerAddress
    )
        external
        onlyStakingPoolOperatorOrMaker(poolId, makerAddress)
    {
        bytes32 makerPoolId = getStakingPoolIdOfMaker(makerAddress);
        if (makerPoolId != poolId) {
            LibRichErrors.rrevert(LibStakingRichErrors.MakerAddressNotRegisteredError(
                makerAddress,
                makerPoolId,
                poolId
            ));
        }

        // load list of makers for the input pool.
        address[] storage makerAddressesByPoolIdPtr = makerAddressesByPoolId[poolId];
        uint256 makerAddressesByPoolIdLength = makerAddressesByPoolIdPtr.length;

        // find index of maker to remove.
        uint indexOfMakerAddress = 0;
        for (; indexOfMakerAddress < makerAddressesByPoolIdLength; ++indexOfMakerAddress) {
            if (makerAddressesByPoolIdPtr[indexOfMakerAddress] == makerAddress) {
                break;
            }
        }

        // remove the maker from the list of makers for this pool.
        // (i) move maker at end of list to the slot occupied by the maker to remove, then
        // (ii) zero out the slot at the end of the list and decrement the length.
        uint256 indexOfLastMakerAddress = makerAddressesByPoolIdLength - 1;
        if (indexOfMakerAddress != indexOfLastMakerAddress) {
            makerAddressesByPoolIdPtr[indexOfMakerAddress] = makerAddressesByPoolIdPtr[indexOfLastMakerAddress];
        }
        makerAddressesByPoolIdPtr[indexOfLastMakerAddress] = NIL_ADDRESS;
        makerAddressesByPoolIdPtr.length -= 1;

        // reset the pool id assigned to the maker.
        poolIdByMakerAddress[makerAddress] = NIL_MAKER_ID;

        // notify
        emit MakerRemovedFromStakingPool(
            poolId,
            makerAddress
        );
    }

    /// @dev Returns the pool id of an input maker.
    function getStakingPoolIdOfMaker(address makerAddress)
        public
        view
        returns (bytes32)
    {
        return poolIdByMakerAddress[makerAddress];
    }

    /// @dev Returns the pool id that the input maker is pending to join.
    function getPendingPoolJoinedByMaker(address makerAddress)
        public
        view
        returns (bytes32)
    {
        return pendingPoolJoinedByMakerAddress[makerAddress];
    }

    /// @dev Returns true iff the maker is assigned to a staking pool.
    /// @param makerAddress Address of maker
    /// @return True iff assigned.
    function isMakerAssignedToStakingPool(address makerAddress)
        public
        view
        returns (bool)
    {
        return getStakingPoolIdOfMaker(makerAddress) != NIL_MAKER_ID;
    }

    /// @dev Returns the makers for a given pool.
    /// @param poolId Unique id of pool.
    /// @return _makerAddressesByPoolId Makers for pool.
    function getMakersForStakingPool(bytes32 poolId)
        public
        view
        returns (address[] memory _makerAddressesByPoolId)
    {
        return makerAddressesByPoolId[poolId];
    }

    /// @dev Returns the current number of makers in a given pool.
    /// @param poolId Unique id of pool.
    /// @return Size of pool.
    function getSizeOfStakingPool(bytes32 poolId)
        public
        view
        returns (uint256)
    {
        return makerAddressesByPoolId[poolId].length;
    }

    /// @dev Returns the unique id that will be assigned to the next pool that is created.
    /// @return Pool id.
    function getNextStakingPoolId()
        public
        view
        returns (bytes32)
    {
        return nextPoolId;
    }

    /// @dev Returns the pool operator
    /// @param poolId Unique id of pool
    /// @return operatorAddress Operator of the pool
    function getStakingPoolOperator(bytes32 poolId)
        public
        view
        returns (address operatorAddress)
    {
        operatorAddress = poolById[poolId].operatorAddress;
        return operatorAddress;
    }

    /// @dev Convenience function for loading information on a pool.
    /// @param poolId Unique id of pool.
    /// @return pool Pool info.
    function _getStakingPool(bytes32 poolId)
        internal
        view
        returns (IStructs.Pool memory pool)
    {
        pool = poolById[poolId];
        return pool;
    }

    /// @dev Computes the unique id that comes after the input pool id.
    /// @param poolId Unique id of pool.
    /// @return Next pool id after input pool.
    function _computeNextStakingPoolId(bytes32 poolId)
        internal
        pure
        returns (bytes32)
    {
        return bytes32(uint256(poolId).safeAdd(POOL_ID_INCREMENT_AMOUNT));
    }
}
