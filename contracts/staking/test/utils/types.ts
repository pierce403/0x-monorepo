import { BigNumber } from '@0x/utils';

export interface StakerBalances {
    zrxBalance: BigNumber;
    stakeBalance: BigNumber;
    stakeBalanceInVault: BigNumber;
    withdrawableStakeBalance: BigNumber;
    activatableStakeBalance: BigNumber;
    activatedStakeBalance: BigNumber;
    deactivatedStakeBalance: BigNumber;
    timeLockedStakeBalance: BigNumber;
}

export interface DelegatorBalances extends StakerBalances {
    delegatedStakeBalance: BigNumber;
    stakeDelegatedToPoolByOwner: BigNumber[];
    stakeDelegatedToPool: BigNumber[];
}

export interface SimulationParams {
    users: string[];
    numberOfPools: number;
    poolOperatorShares: number[];
    // addOperatorsAsMakers: boolean[];
    stakeByPoolOperator: BigNumber[];
    numberOfMakers: number;
    numberOfMakersPerPool: number[];
    protocolFeesByMaker: BigNumber[];
    numberOfDelegators: number;
    numberOfDelegatorsPerPool: number[];
    stakeByDelegator: BigNumber[];
    expectedFeesByPool: BigNumber[];
    expectedPayoutByPool: BigNumber[];
    expectedPayoutByPoolOperator: BigNumber[];
    expectedMembersPayoutByPool: BigNumber[];
    expectedPayoutByDelegator: BigNumber[];
    exchangeAddress: string;
    delegateInNextEpoch: boolean;
    withdrawByUndelegating: boolean;
}
