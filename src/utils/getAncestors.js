// Libs
export default function getAncestors(assets, assetId) {
  const asset: Asset = assets[assetId];
  let parent = asset && assets[asset.id];
  const ancestors = [];

  while (parent && parent.id && parent.id > 1) {
    ancestors.splice(0, 0, parent);
    parent = assets[parent.parent];
  }

  return ancestors;
}
