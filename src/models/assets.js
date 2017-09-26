import fetch from 'node-fetch';
import redis from '../redis';

export async function server() {
  await local();

  const response = await fetch(
    'https://dev.granduke.net/asset/?toFarmsOnly=True&shape=True',
    {
      headers: {
        Authorization: 'Token 0d7d912d9e71f061372bfaa5e2cc670ff2b232c6',
      },
    },
  );

  const json = await response.json();
  await store(json);
  return json;
}

export async function store(assets) {
  assets.forEach(asset => {
    const { id, label, parent, category } = asset;
    redis.sadd('assets', id);
    redis.hmset(`asset:${id}`, [
      'id',
      id || '',
      'label',
      label || '',
      'parent',
      parent || '',
      'category',
      category || '',
    ]);
  });
}

async function getAsset(assetId) {
  const asset = await redis.hgetallAsync(`asset:${assetId}`);
  console.log(asset);
  const [, id, , label, , parent, , category] = asset;
  return { id, label, parent, category };
}

export async function local() {
  const assetIds = await redis.smembersAsync('assets');

  if (assetIds) {
    console.log(assetIds.length);
    try {
      const assets = await Promise.all(assetIds.map(getAsset));
      return assets;
    } catch (error) {
      console.error(error);
    }
  }
}
