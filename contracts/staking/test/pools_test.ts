import { ERC20ProxyContract, ERC20Wrapper } from '@0x/contracts-asset-proxy';
import { DummyERC20TokenContract } from '@0x/contracts-erc20';
import { blockchainTests, expect } from '@0x/contracts-test-utils';
import { StakingRevertErrors } from '@0x/order-utils';
import { BigNumber } from '@0x/utils';
import * as _ from 'lodash';

import { MakerActor } from './actors/maker_actor';
import { PoolOperatorActor } from './actors/pool_operator_actor';
import { constants as stakingConstants } from './utils/constants';
import { StakingWrapper } from './utils/staking_wrapper';

// tslint:disable:no-unnecessary-type-assertion
blockchainTests('Staking Pool Management', env => {
    // constants
    const ZRX_TOKEN_DECIMALS = new BigNumber(18);
    // tokens & addresses
    let accounts: string[];
    let owner: string;
    let users: string[];
    let zrxTokenContract: DummyERC20TokenContract;
    let erc20ProxyContract: ERC20ProxyContract;
    // wrappers
    let stakingWrapper: StakingWrapper;
    let erc20Wrapper: ERC20Wrapper;
    // tests
    before(async () => {
        // create accounts
        accounts = await env.web3Wrapper.getAvailableAddressesAsync();
        owner = accounts[0];
        users = accounts.slice(1);
        // deploy erc20 proxy
        erc20Wrapper = new ERC20Wrapper(env.provider, accounts, owner);
        erc20ProxyContract = await erc20Wrapper.deployProxyAsync();
        // deploy zrx token
        [zrxTokenContract] = await erc20Wrapper.deployDummyTokensAsync(1, ZRX_TOKEN_DECIMALS);
        await erc20Wrapper.setBalancesAndAllowancesAsync();
        // deploy staking contracts
        stakingWrapper = new StakingWrapper(env.provider, owner, erc20ProxyContract, zrxTokenContract);
        await stakingWrapper.deployAndConfigureContractsAsync();
    });
    blockchainTests.resets('Staking Pool Management', () => {
        it('Should successfully create a pool', async () => {
            // test parameters
            const operatorAddress = users[0];
            const operatorShare = 39;
            const poolOperator = new PoolOperatorActor(operatorAddress, stakingWrapper);
            // create pool
            const poolId = await poolOperator.createStakingPoolAsync(operatorShare, true);
            expect(poolId).to.be.equal(stakingConstants.INITIAL_POOL_ID);
            // check that the next pool id was incremented
            const nextPoolId = await stakingWrapper.getNextStakingPoolIdAsync();
            expect(nextPoolId).to.be.equal(stakingConstants.SECOND_POOL_ID);
        });
        it('Should successfully add/remove a maker to a pool', async () => {
            // test parameters
            const operatorAddress = users[0];
            const operatorShare = 39;
            const poolOperator = new PoolOperatorActor(operatorAddress, stakingWrapper);
            const makerAddress = users[1];
            const maker = new MakerActor(makerAddress, stakingWrapper);
            // create pool
            const poolId = await poolOperator.createStakingPoolAsync(operatorShare, true);
            expect(poolId).to.be.equal(stakingConstants.INITIAL_POOL_ID);
            // maker joins pool
            await maker.joinStakingPoolAsync(poolId);
            // operator adds maker to pool
            await poolOperator.addMakerToStakingPoolAsync(poolId, makerAddress);
            // operator removes maker from pool
            await poolOperator.removeMakerFromStakingPoolAsync(poolId, makerAddress);
        });
        it('Maker should successfully remove themselves from a pool', async () => {
            // test parameters
            const operatorAddress = users[0];
            const operatorShare = 39;
            const poolOperator = new PoolOperatorActor(operatorAddress, stakingWrapper);
            const makerAddress = users[1];
            const maker = new MakerActor(makerAddress, stakingWrapper);
            // create pool
            const poolId = await poolOperator.createStakingPoolAsync(operatorShare, true);
            expect(poolId).to.be.equal(stakingConstants.INITIAL_POOL_ID);
            // maker joins pool
            await maker.joinStakingPoolAsync(poolId);
            // operator adds maker to pool
            await poolOperator.addMakerToStakingPoolAsync(poolId, makerAddress);
            // maker removes themselves from pool
            await maker.removeMakerFromStakingPoolAsync(poolId, makerAddress);
        });
        it('Should successfully add/remove multipler makers to the same pool', async () => {
            // test parameters
            const operatorAddress = users[0];
            const operatorShare = 39;
            const poolOperator = new PoolOperatorActor(operatorAddress, stakingWrapper);
            const makerAddresses = users.slice(1, 4);
            const makers = [
                new MakerActor(makerAddresses[0], stakingWrapper),
                new MakerActor(makerAddresses[1], stakingWrapper),
                new MakerActor(makerAddresses[2], stakingWrapper),
            ];
            // create pool
            const poolId = await poolOperator.createStakingPoolAsync(operatorShare, true);
            expect(poolId).to.be.equal(stakingConstants.INITIAL_POOL_ID);
            // add makers to pool
            await Promise.all([
                makers[0].joinStakingPoolAsync(poolId),
                makers[1].joinStakingPoolAsync(poolId),
                makers[2].joinStakingPoolAsync(poolId),
            ]);
            await Promise.all([
                poolOperator.addMakerToStakingPoolAsync(poolId, makerAddresses[0]),
                poolOperator.addMakerToStakingPoolAsync(poolId, makerAddresses[1]),
                poolOperator.addMakerToStakingPoolAsync(poolId, makerAddresses[2]),
            ]);
            // remove maker from pool
            await Promise.all([
                poolOperator.removeMakerFromStakingPoolAsync(poolId, makerAddresses[0]),
                poolOperator.removeMakerFromStakingPoolAsync(poolId, makerAddresses[1]),
                poolOperator.removeMakerFromStakingPoolAsync(poolId, makerAddresses[2]),
            ]);
        });
        it('Should fail if maker already assigned to pool tries to join', async () => {
            // test parameters
            const operatorShare = 39;
            const assignedPoolOperator = new PoolOperatorActor(users[0], stakingWrapper);
            const otherPoolOperator = new PoolOperatorActor(users[1], stakingWrapper);

            const makerAddress = users[2];
            const maker = new MakerActor(makerAddress, stakingWrapper);

            // create pools
            const assignedPoolId = await assignedPoolOperator.createStakingPoolAsync(operatorShare, true);
            const otherPoolId = await otherPoolOperator.createStakingPoolAsync(operatorShare, true);
            expect(assignedPoolId).to.be.equal(stakingConstants.INITIAL_POOL_ID);
            expect(otherPoolId).to.be.equal(stakingConstants.SECOND_POOL_ID);

            // maker joins first pool
            await maker.joinStakingPoolAsync(assignedPoolId);
            // first pool operator adds maker
            await assignedPoolOperator.addMakerToStakingPoolAsync(assignedPoolId, makerAddress);

            const revertError = new StakingRevertErrors.MakerAddressAlreadyRegisteredError(makerAddress);
            // second pool operator now tries to add maker
            await otherPoolOperator.addMakerToStakingPoolAsync(otherPoolId, makerAddress, revertError);
        });
        it('Should fail to add maker to pool if the maker has not joined any pools', async () => {
            // test parameters
            const operatorAddress = users[0];
            const operatorShare = 39;
            const poolOperator = new PoolOperatorActor(operatorAddress, stakingWrapper);

            const makerAddress = users[1];

            // create pool
            const poolId = await poolOperator.createStakingPoolAsync(operatorShare, true);
            expect(poolId).to.be.equal(stakingConstants.INITIAL_POOL_ID);

            const revertError = new StakingRevertErrors.MakerNotPendingJoinError(
                makerAddress,
                stakingConstants.NIL_POOL_ID,
                poolId,
            );
            // operator adds maker to pool
            await poolOperator.addMakerToStakingPoolAsync(poolId, makerAddress, revertError);
        });
        it('Should fail to add maker to pool if the maker joined a different pool', async () => {
            // test parameters
            const operatorShare = 39;
            const assignedPoolOperator = new PoolOperatorActor(users[0], stakingWrapper);
            const otherPoolOperator = new PoolOperatorActor(users[1], stakingWrapper);

            const makerAddress = users[2];
            const maker = new MakerActor(makerAddress, stakingWrapper);

            // create pools
            const joinedPoolId = await assignedPoolOperator.createStakingPoolAsync(operatorShare, true);
            const otherPoolId = await otherPoolOperator.createStakingPoolAsync(operatorShare, true);
            expect(joinedPoolId).to.be.equal(stakingConstants.INITIAL_POOL_ID);
            expect(otherPoolId).to.be.equal(stakingConstants.SECOND_POOL_ID);

            // maker joins first pool
            await maker.joinStakingPoolAsync(joinedPoolId);

            const revertError = new StakingRevertErrors.MakerNotPendingJoinError(
                makerAddress,
                joinedPoolId,
                otherPoolId,
            );
            // second pool operator now tries to add maker
            await otherPoolOperator.addMakerToStakingPoolAsync(otherPoolId, makerAddress, revertError);
        });
        it('Should fail to add the same maker twice', async () => {
            // test parameters
            const operatorAddress = users[0];
            const operatorShare = 39;
            const poolOperator = new PoolOperatorActor(operatorAddress, stakingWrapper);
            const makerAddress = users[1];
            const maker = new MakerActor(makerAddress, stakingWrapper);
            // create pool
            const poolId = await poolOperator.createStakingPoolAsync(operatorShare, true);
            expect(poolId).to.be.equal(stakingConstants.INITIAL_POOL_ID);
            // add maker to pool
            await maker.joinStakingPoolAsync(poolId);
            await poolOperator.addMakerToStakingPoolAsync(poolId, makerAddress);
            const revertError = new StakingRevertErrors.MakerAddressAlreadyRegisteredError(makerAddress);
            // add same maker to pool again
            await poolOperator.addMakerToStakingPoolAsync(poolId, makerAddress, revertError);
        });
        it('Should fail to remove a maker that does not exist', async () => {
            // test parameters
            const operatorAddress = users[0];
            const operatorShare = 39;
            const poolOperator = new PoolOperatorActor(operatorAddress, stakingWrapper);
            const makerAddress = users[1];
            // create pool
            const poolId = await poolOperator.createStakingPoolAsync(operatorShare, true);
            expect(poolId).to.be.equal(stakingConstants.INITIAL_POOL_ID);
            const revertError = new StakingRevertErrors.MakerAddressNotRegisteredError(
                makerAddress,
                stakingConstants.NIL_POOL_ID,
                poolId,
            );
            // remove non-existent maker from pool
            await poolOperator.removeMakerFromStakingPoolAsync(poolId, makerAddress, revertError);
        });
        it('Should fail to add a maker when called by someone other than the pool operator', async () => {
            // test parameters
            const operatorAddress = users[0];
            const operatorShare = 39;
            const poolOperator = new PoolOperatorActor(operatorAddress, stakingWrapper);
            const makerAddress = users[1];
            const maker = new MakerActor(makerAddress, stakingWrapper);
            const notOperatorAddress = users[2];
            // create pool
            const poolId = await poolOperator.createStakingPoolAsync(operatorShare, true);
            expect(poolId).to.be.equal(stakingConstants.INITIAL_POOL_ID);
            // add maker to pool
            await maker.joinStakingPoolAsync(poolId);
            const revertError = new StakingRevertErrors.OnlyCallableByPoolOperatorError(
                notOperatorAddress,
                operatorAddress,
            );
            const tx = stakingWrapper.addMakerToStakingPoolAsync(poolId, makerAddress, notOperatorAddress);
            await expect(tx).to.revertWith(revertError);
        });
        it('Should fail to remove a maker when called by someone other than the pool operator or maker', async () => {
            // test parameters
            const operatorAddress = users[0];
            const operatorShare = 39;
            const poolOperator = new PoolOperatorActor(operatorAddress, stakingWrapper);
            const makerAddress = users[1];
            const maker = new MakerActor(makerAddress, stakingWrapper);
            const neitherOperatorNorMakerAddress = users[2];
            // create pool
            const poolId = await poolOperator.createStakingPoolAsync(operatorShare, true);
            expect(poolId).to.be.equal(stakingConstants.INITIAL_POOL_ID);
            // add maker to pool
            await maker.joinStakingPoolAsync(poolId);
            await poolOperator.addMakerToStakingPoolAsync(poolId, makerAddress);
            // try to remove the maker address from an address other than the operator
            const revertError = new StakingRevertErrors.OnlyCallableByPoolOperatorOrMakerError(
                neitherOperatorNorMakerAddress,
                operatorAddress,
                makerAddress,
            );
            const tx = stakingWrapper.removeMakerFromStakingPoolAsync(
                poolId,
                makerAddress,
                neitherOperatorNorMakerAddress,
            );
            await expect(tx).to.revertWith(revertError);
        });
        it('Should fail to add a maker if the pool is full', async () => {
            // test parameters
            const operatorAddress = users[0];
            const operatorShare = 39;
            const poolOperator = new PoolOperatorActor(operatorAddress, stakingWrapper);

            const makerAddresses = users.slice(1, stakingConstants.MAX_POOL_SIZE + 2);
            const makers = makerAddresses.map(makerAddress => new MakerActor(makerAddress, stakingWrapper));

            // create pool
            const poolId = await poolOperator.createStakingPoolAsync(operatorShare, false);
            expect(poolId).to.be.equal(stakingConstants.INITIAL_POOL_ID);

            // add makers to pool
            await Promise.all(makers.map(maker => maker.joinStakingPoolAsync(poolId)));
            await Promise.all(
                _.initial(makerAddresses).map(makerAddress =>
                    poolOperator.addMakerToStakingPoolAsync(poolId, makerAddress),
                ),
            );

            // Try to add last one more maker to the pool
            const revertError = new StakingRevertErrors.PoolIsFullError(poolId);
            await poolOperator.addMakerToStakingPoolAsync(poolId, _.last(makerAddresses) as string, revertError);
        });
    });
});
// tslint:enable:no-unnecessary-type-assertion
