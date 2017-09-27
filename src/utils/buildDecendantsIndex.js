// Libs
import _ from 'lodash';

// Utils
import getDecendants from './getDecendants';

const REGION = 'Region';
const HUB = 'Hub';
const TERRITORY = 'Territory';
const REPRESENTATIVE = 'Representative';
const GROWER = 'Grower';
const FARM = 'Farm';

// Exports
export default function buildDecendantsIndex(assets) {
  return _.reduce(
    assets,
    (acc, asset) => {
      if (
        [
          '',
          null,
          REGION,
          HUB,
          TERRITORY,
          REPRESENTATIVE,
          GROWER,
          FARM,
        ].indexOf(asset.category) >= 0
      ) {
        acc[asset.id] = _.map(getDecendants(assets, asset.id), 'id');
      }

      return acc;
    },
    {},
  );
}
