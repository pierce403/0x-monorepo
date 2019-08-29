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

import "@0x/contracts-exchange-libs/contracts/src/LibMath.sol";
import "@0x/contracts-utils/contracts/src/LibRichErrors.sol";
import "@0x/contracts-utils/contracts/src/LibSafeMath.sol";
import "../libs/LibStakingRichErrors.sol";
import "../libs/LibSafeDowncast.sol";
import "./MixinVaultCore.sol";
import "../interfaces/IStakingPoolRewardVault.sol";
import "../immutable/MixinConstants.sol";


/// @dev This vault manages staking pool rewards.
/// Rewards can be deposited and withdrawn by the staking contract.
/// There is a "Catastrophic Failure Mode" that, when invoked, only
/// allows withdrawals to be made. Once this vault is in catastrophic
/// failure mode, it cannot be returned to normal mode; this prevents
/// corruption of related state in the staking contract.
///
/// When in Catastrophic Failure Mode, the Staking contract can still
/// perform withdrawals on behalf of its users.
contract StakingPoolRewardVault is
    Authorizable,
    IStakingPoolRewardVault,
    MixinDeploymentConstants,
    MixinConstants,
    MixinVaultCore
{
    using LibSafeMath for uint256;
    using LibSafeDowncast for uint256;

    // mapping from poolId to Pool metadata
    mapping (bytes32 => Pool) internal poolById;

    /// @dev Fallback function. This contract is payable, but only by the staking contract.
    function ()
        external
        payable
        onlyStakingContract
        onlyNotInCatastrophicFailure
    {
        emit RewardDeposited(UNKNOWN_STAKING_POOL_ID, msg.value);
    }

    /// @dev Deposit a reward in ETH for a specific pool.
    /// Note that this is only callable by the staking contract, and when
    /// not in catastrophic failure mode.
    /// @param poolId Unique Id of pool.
    function depositFor(bytes32 poolId)
        external
        payable
        onlyStakingContract
        onlyNotInCatastrophicFailure
    {
        // update balance of pool
        uint256 amount = msg.value;
        Pool memory pool = poolById[poolId];
        _incrementPoolBalances(pool, amount);
        poolById[poolId] = pool;

        // notify
        emit RewardDeposited(poolId, amount);
    }

    /// @dev Record a deposit for a pool. This deposit should be in the same transaction,
    /// which is enforced by the staking contract. We do not enforce it here to save (a lot of) gas.
    /// Note that this is only callable by the staking contract, and when
    /// not in catastrophic failure mode.
    /// @param poolId Unique Id of pool.
    /// @param amount Amount in ETH to record.
    function recordDepositFor(bytes32 poolId, uint256 amount)
        external
        onlyStakingContract
        onlyNotInCatastrophicFailure
    {
        // update balance of pool
        Pool memory pool = poolById[poolId];
        _incrementPoolBalances(pool, amount);
        poolById[poolId] = pool;
    }

    /// @dev Withdraw some amount in ETH of an operator's reward.
    /// Note that this is only callable by the staking contract, and when
    /// not in catastrophic failure mode.
    /// @param poolId Unique Id of pool.
    /// @param amount Amount in ETH to record.
    function withdrawForOperator(bytes32 poolId, uint256 amount)
        external
        onlyStakingContract
    {
        // sanity check - sufficient balance?
        uint256 operatorBalance = uint256(poolById[poolId].operatorBalance);
        if (amount > operatorBalance) {
            LibRichErrors.rrevert(LibStakingRichErrors.AmountExceedsBalanceOfPoolError(
                amount,
                poolById[poolId].operatorBalance
            ));
        }

        // update balance and transfer `amount` in ETH to staking contract
        poolById[poolId].operatorBalance = operatorBalance.safeSub(amount).downcastToUint96();
        stakingContractAddress.transfer(amount);

        // notify
        emit RewardWithdrawnForOperator(poolId, amount);
    }

    /// @dev Withdraw some amount in ETH of a pool member.
    /// Note that this is only callable by the staking contract, and when
    /// not in catastrophic failure mode.
    /// @param poolId Unique Id of pool.
    /// @param amount Amount in ETH to record.
    function withdrawForMember(bytes32 poolId, uint256 amount)
        external
        onlyStakingContract
    {
        // sanity check - sufficient balance?
        uint256 membersBalance = uint256(poolById[poolId].membersBalance);
        if (amount > membersBalance) {
            LibRichErrors.rrevert(LibStakingRichErrors.AmountExceedsBalanceOfPoolError(
                amount,
                poolById[poolId].membersBalance
            ));
        }

        // update balance and transfer `amount` in ETH to staking contract
        poolById[poolId].membersBalance = membersBalance.safeSub(amount).downcastToUint96();
        stakingContractAddress.transfer(amount);

        // notify
        emit RewardWithdrawnForMember(poolId, amount);
    }

    /// @dev Register a new staking pool.
    /// Note that this is only callable by the staking contract, and when
    /// not in catastrophic failure mode.
    /// @param poolId Unique Id of pool.
    /// @param operatorShare Percentage of rewards given to the pool operator.
    function registerStakingPool(
        bytes32 poolId,
        address payable operatorAddress,
        uint8 operatorShare
    )
        external
        onlyStakingContract
        onlyNotInCatastrophicFailure
    {
        // operator share must be a valid percentage
        if (operatorShare > PERCENTAGE_DENOMINATOR) {
            LibRichErrors.rrevert(LibStakingRichErrors.OperatorShareMustBeBetween0And100Error(
                poolId,
                operatorShare
            ));
        }

        // pool must not exist
        Pool memory pool = poolById[poolId];
        if (pool.initialized) {
            LibRichErrors.rrevert(LibStakingRichErrors.PoolAlreadyExistsError(
                poolId
            ));
        }

        // initialize pool
        pool.initialized = true;
        pool.operatorAddress = operatorAddress;
        pool.operatorShare = operatorShare;
        poolById[poolId] = pool;

        // notify
        emit StakingPoolRegistered(poolId, operatorShare);
    }

    /// @dev Decreases the operator share for the given pool (i.e. increases pool rewards for members)
    /// @param poolId Unique Id of pool.
    /// @param amountToDecrease The amount to decrease the operatorShare by.
    function decreaseOperatorShare(bytes32 poolId, uint8 amountToDecrease)
        external
        onlyStakingContract
        onlyNotInCatastrophicFailure
    {
        Pool memory pool = poolById[poolId];
        uint8 oldOperatorShare = pool.operatorShare;

        uint8 newOperatorShare;
        if (amountToDecrease > oldOperatorShare) {
            newOperatorShare = 0;
        } else {
            newOperatorShare = oldOperatorShare - amountToDecrease;
        }

        pool.operatorShare = newOperatorShare;
        emit OperatorShareDecreased(poolId, oldOperatorShare, newOperatorShare);
    }

    /// @dev Returns the address of the operator of a given pool
    /// @param poolId Unique id of pool
    /// @return operatorAddress Operator of the pool
    function operatorOf(bytes32 poolId)
        external
        view
        returns (address payable)
    {
        return poolById[poolId].operatorAddress;
    }

    /// @dev Returns the total balance of a pool.
    /// @param poolId Unique Id of pool.
    /// @return Balance in ETH.
    function balanceOf(bytes32 poolId)
        external
        view
        returns (uint256)
    {
        Pool memory pool = poolById[poolId];
        return pool.operatorBalance + pool.membersBalance;
    }

    /// @dev Returns the balance of a pool operator.
    /// @param poolId Unique Id of pool.
    /// @return Balance in ETH.
    function balanceOfOperator(bytes32 poolId)
        external
        view
        returns (uint256)
    {
        return poolById[poolId].operatorBalance;
    }

    /// @dev Returns the balance co-owned by members of a pool.
    /// @param poolId Unique Id of pool.
    /// @return Balance in ETH.
    function balanceOfMembers(bytes32 poolId)
        external
        view
        returns (uint256)
    {
        return poolById[poolId].membersBalance;
    }

    /// @dev Increments a balances in a Pool struct, splitting the input amount between the
    /// pool operator and members of the pool based on the pool operator's share.
    /// @param pool Pool struct with the balances to increment.
    /// @param amount Amount to add to balance.
    function _incrementPoolBalances(Pool memory pool, uint256 amount)
        private
        pure
    {
        // compute portions. One of the two must round down: the operator always receives the leftover from rounding.
        uint256 operatorPortion = LibMath.getPartialAmountCeil(
            uint256(pool.operatorShare),  // Operator share out of 100
            PERCENTAGE_DENOMINATOR,
            amount
        );

        uint256 poolPortion = amount.safeSub(operatorPortion);

        // update balances
        pool.operatorBalance = uint256(pool.operatorBalance).safeAdd(operatorPortion).downcastToUint96();
        pool.membersBalance = uint256(pool.membersBalance).safeAdd(poolPortion).downcastToUint96();
    }
}
