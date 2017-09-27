// Libs
import _ from 'lodash';

// Exports
export default function buildChildrenIndex(assets) {
  return _.reduce(
    assets,
    (acc, asset) => {
      //
      const children = acc[asset.parent] || [];

      acc[asset.parent] = _.uniq([...children, asset.id]);

      return acc;
    },
    {},
  );
}
