// Libs
import _ from 'lodash';

// Utils
import getAncestors from './getAncestors';

// Exports
export default function buildAncestorsIndex(assets) {
  const ancestors = _.reduce(
    assets,
    (acc, asset) => {
      const ancestorIds = _.map(getAncestors(assets, asset.id), 'id');
      acc[asset.id] = ancestorIds;
      return acc;
    },
    {},
  );

  const decendants = _.reduce(
    ancestors,
    (acc, ancestorIds, childId) => {
      _.forEach(ancestorIds, id => {
        acc[id] = acc[id] || [];
        acc[id].push(childId);
      });
      return acc;
    },
    {},
  );

  return { ancestors, decendants };
}
