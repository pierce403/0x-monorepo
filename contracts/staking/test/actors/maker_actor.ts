import { expect } from '@0x/contracts-test-utils';
import { RevertError } from '@0x/utils';
import * as _ from 'lodash';

import { constants as stakingConstants } from '../utils/constants';

import { BaseActor } from './base_actor';

export class MakerActor extends BaseActor {
    public async joinStakingPoolAsMakerAsync(poolId: string, revertError?: RevertError): Promise<void> {
        // Join pool
        const txReceiptPromise = this._stakingWrapper.joinStakingPoolAsMakerAsync(poolId, this._owner);

        if (revertError !== undefined) {
            await expect(txReceiptPromise).to.revertWith(revertError);
            return;
        }
        await txReceiptPromise;

        // Pool id of the maker should be nil (join would've thrown otherwise)
        const poolIdOfMaker = await this._stakingWrapper.getStakingPoolIdOfMakerAsync(this._owner);
        expect(poolIdOfMaker, 'pool id of maker').to.be.equal(stakingConstants.NIL_POOL_ID);
    }

    public async removeMakerFromStakingPoolAsync(
        poolId: string,
        makerAddress: string,
        revertError?: RevertError,
    ): Promise<void> {
        // remove maker (should fail if makerAddress !== this._owner)
        const txReceiptPromise = this._stakingWrapper.removeMakerFromStakingPoolAsync(
            poolId,
            makerAddress,
            this._owner,
        );

        if (revertError !== undefined) {
            await expect(txReceiptPromise).to.revertWith(revertError);
            return;
        }
        await txReceiptPromise;

        // check the pool id of the maker
        const poolIdOfMakerAfterRemoving = await this._stakingWrapper.getStakingPoolIdOfMakerAsync(this._owner);
        expect(poolIdOfMakerAfterRemoving, 'pool id of maker').to.be.equal(stakingConstants.NIL_POOL_ID);

        // check the list of makers for the pool
        const makerAddressesForPoolAfterRemoving = await this._stakingWrapper.getMakersForStakingPoolAsync(poolId);
        expect(makerAddressesForPoolAfterRemoving, 'maker addresses for pool').to.not.include(this._owner);
    }
}
