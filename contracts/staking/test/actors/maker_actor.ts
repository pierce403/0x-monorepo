import * as _ from 'lodash';

import { BaseActor } from './base_actor';

export class MakerActor extends BaseActor {
    public async joinStakingPoolAsync(poolId: string): Promise<void> {
        await this._stakingWrapper.joinStakingPoolAsync(poolId, this._owner);
    }
}
