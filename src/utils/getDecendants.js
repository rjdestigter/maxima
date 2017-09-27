// Libs
import _ from 'lodash';

export default function getDecendants(assets, assetId) {
  const children = _.filter(assets, { parent: assetId });
  const decendants = _.flatMap(children, child =>
    getDecendants(assets, child.id),
  );

  return [...children, ...decendants];
}
