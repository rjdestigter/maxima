// Libs
import _ from 'lodash';

// Utils
import getAncestors from './getAncestors';

// Exports
export default function buildAncestorsIndex(assets) {
  return _.reduce(
    assets,
    (acc, asset) => {
      const ancestorIds = _.map(getAncestors(assets, asset.id), 'id');
      acc.ancestors[asset.id] = ancestorIds;

      _.forEach(ancestorIds, id => {
        acc.decendants[id] = acc.decendants[id] || [];
        acc.decendants[id].push(asset.id);
      });

      return acc;
    },
    { ancestors: {}, decendants: {} },
  );
}
