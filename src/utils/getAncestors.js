// Libs
export default function getAncestors(assets, assetId) {
  const asset: Asset = assets[assetId];
  const parent = asset && assets[asset.parent];

  if (parent && parent.id) {
    return [parent, ...getAncestors(assets, parent.id)];
  }

  return [];
}
