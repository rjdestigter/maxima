import fetch from 'node-fetch';
import _ from 'lodash';

import redis from '../redis';
import { currentUser } from './currentUser';
import { spawn } from 'threads';

import getUrl from '../utils/url';
import buildAncestorsIndex from '../utils/buildAncestorsIndex';
import buildDecendantsIndex from '../utils/buildDecendantsIndex';

const REGION = 'Region';
const HUB = 'Hub';
const TERRITORY = 'Territory';
const REPRESENTATIVE = 'Representative';
const GROWER = 'Grower';
const SALES_OFFICE = 'Sales Office';
const FARM = 'Farm';

/**
 * getShape Promises a shape model if it can find it.
 * @param  {!number} shapeId Id of the shape model
 * @return {?Object}         The shape model or null if it is not able to find it.
 */
async function getShape(shapeId) {
  try {
    if (shapeId) {
      // Request the shape from redis
      const shape = await redis.hgetallAsync(`shape:${shapeId}`);

      if (shape) {
        // Destructure the shape attributes
        const { id, asset, shapeData } = shape;

        // Return the shape model
        return {
          id: Number(id),
          asset: Number(asset),
          shapeData,
        };
      }
    }
  } catch (error) {
    console.error(error);
  }

  return null;
}

/**
 * getAsset Promises an asset model if it can find it.
 * @param  {!number} assetId Id of the asset model
 * @return {Promise.<?Object?>}         The asset model or null if it is not able to find it.
 */
async function getAsset(assetId) {
  const { id, label, parent, category, shape } = await redis.hgetallAsync(
    `asset:${assetId}`,
  );

  return {
    id: Number(id) || null,
    label: label || '',
    parent: Number(parent) || null,
    category,
    shape: await getShape(shape),
  };
}

export async function rebuildIndexes() {
  console.log('Rebuilding index.');
  // Rebuild the index of ancestors and decendants
  // Get a list of all keys linking to assets
  const assetKeys = await redis.keysAsync('asset:*');

  // Map over the keys and return a list of assets in store
  const assetsInStore = await Promise.all(
    _.map(assetKeys, async key => {
      try {
        const { id, label, parent, category, shape } = await redis.hgetallAsync(
          key,
        );

        return {
          id: Number(id) || null,
          label: label || '',
          parent: Number(parent) || null,
          category,
          shape: await getShape(shape),
        };
      } catch (error) {
        console.error(error);
      }

      return null;
    }),
  );

  // Filter out any assets not found as well as create a map of id -> asset
  const assetsById = _.keyBy(assetsInStore.filter(_.identity), 'id');

  try {
    // Rebuild ancestry index
    console.log('Rebuild indexes.');
    const { ancestors, decendants } = buildAncestorsIndex(assetsById, 'id');
    console.log('Indexes rebuilt.');

    _.forEach(ancestors, (ancestorIds, assetId) => {
      redis.sadd(`ancestors:${assetId}`, ...ancestorIds);
    });

    console.log('Ancestry Indexes stored in cache.');

    _.forEach(decendants, (decendantIds, assetId) => {
      redis.sadd(`decendants:${assetId}`, ...decendantIds);
    });

    console.log('Decendants Indexes stored in cache.');
  } catch (error) {
    console.error(error)
  }

  // Rebuild decendants index
  // const decendants = _.reduce(ancestors, (ancestorIds, assetId))
  // console.log('Decendants rebuilt.');
  //
  // _.forEach(decendants, (decendantIds, assetId) => {
  //   _.forEach(decendantIds, decendantId => {
  //     redis.sadd(`decendants:${assetId}`, decendantId);
  //   });
  // });

  // console.log('Decendants stored in cache.');
}

/**
 * Store a list of assets in redis
 * @param  {Array} data   List of assets received from the server
 * @param  {?number} season Optional seasonId assets were filtered by
 * @return {Promise.<>}        void
 */
export async function store(data, { season }) {
  data.forEach(asset => {
    // Destructure asset attributes
    const { id, label, parent, category, shape } = asset;

    // Add the assetId to the set of assetIds in redis
    redis.sadd('assets', id);

    // Add the assetId to the set of assetIds by category in redis
    if (category) redis.sadd(category, id);

    // Add the assetId to the set of assetIds by seasonId in redis
    // if the asset is a seasonal asset.
    if (
      season &&
      [
        REGION,
        HUB,
        TERRITORY,
        REPRESENTATIVE,
        GROWER,
        SALES_OFFICE,
        FARM,
      ].indexOf(category) < 0
    ) {
      redis.sadd(`season:${season}`, id);
    }

    // Store the asset in redis
    redis.hmset(`asset:${id}`, [
      'id',
      id || '',
      'label',
      label || '',
      'parent',
      parent || '',
      'category',
      category || '',
      'shape',
      (shape && shape.id) || '',
    ]);

    // Store the shape in redis if it was received as well
    if (shape) {
      // Add the shapeId to the set of shapeIds in redis
      redis.sadd('shapes', shape.id);

      // Store the shape
      redis.hmset(`shape:${shape.id}`, [
        'id',
        shape.id,
        'shapeData',
        shape.shapeData,
      ]);
    }
  });

  const rebuild = await redis.getAsync('rebuild:index');

  if (rebuild === '13') {
    return;
  }

  rebuildIndexes();
}

/**
 * Fetch requested assets from the local redis cache
 * @param  {Object} user   Authenticated user
 * @param  {Object} options   Options
 * @param  {?number} options.rootAsset Filter by assetId
 * @param  {?boolean} options.shape Include shapes
 * @param  {?boolean} options.toFarmsOnly Return non-seasonal assets only if true
 * @param  {?string} options.category Filter by category
 * @return {Promise.<Array.<Object>>} List of assets returned from the redis cache
 */
export async function local(
  user,
  { rootAsset, season, shape, toFarmsOnly, category },
) {
  if (!user && user.id) {
    throw Error('No user provided');
  }

  const tempKey1 = `temp1:${user.id}:${Math.random()}`;
  const tempKey2 = `temp2:${user.id}:${Math.random()}`;
  let assetIds;

  // List of all assetIds attached to permissions that have asset read.
  const permittedRootIds = await redis.smembersAsync(
    `perm:asset:read:${user.id}`,
  );
  // List of keys linking to each set of decendants for each assetId with read permission.
  const permittedSetKeys = _.map(permittedRootIds, id => `decendants:${id}`);

  // Store a temporary union of all asset ids the user has access too.
  await redis.sunionstoreAsync(tempKey2, ...permittedSetKeys);
  await redis.saddAsync(tempKey2, ...permittedRootIds);

  if (toFarmsOnly) {
    // Union of the sets of all non-seasonal assetIds by category
    await redis.sunionstoreAsync(
      tempKey1,
      REGION,
      HUB,
      TERRITORY,
      REPRESENTATIVE,
      GROWER,
      SALES_OFFICE,
      FARM,
    );

    // Assets to be returned are an intersection of the list of assetIds
    // that are non-seasonal and the user has access too.
    assetIds = await redis.sinterAsync(tempKey2, tempKey1);
  } else if (category) {
    assetIds = await redis.sinterAsync(tempKey2, category);
  } else if (rootAsset && season) {
    assetIds = await redis.sinterAsync(
      tempKey2,
      `season:${season}`,
      `decendants:${rootAsset}`,
    );
  } else {
    assetIds = await redis.sinterAsync(tempKey2, 'assets');
  }

  redis.del(tempKey1, tempKey2);

  if (assetIds) {
    try {
      const list = await Promise.all(assetIds.map(getAsset));
      return list.filter(asset => asset);
    } catch (error) {
      return [];
    }
  }

  return [];
}

/**
 * Fetch requested assets from the server
 * @param  {Object} options   Options
 * @param  {string} options.token User's authentication token
 * @param  {?number} options.rootAsset Filter by assetId
 * @param  {?boolean} options.shape Include shapes
 * @param  {?boolean} options.toFarmsOnly Return non-seasonal assets only if true
 * @param  {?string} options.category Filter by category
 * @return {Promise.<Array.<Object>>} List of assets returned from the redis cache
 */
export async function server({
  token,
  rootAsset,
  season,
  shape,
  toFarmsOnly,
  category,
}) {
  // Build the user given possible query parameters
  const url = getUrl({
    path: 'asset/',
    queryParams: {
      rootAsset,
      season,
      shape,
      toFarmsOnly,
      category,
    },
  });

  console.log('-----------');
  console.log('Fetching from server at');
  console.log(url);
  console.log('-----------');

  try {
    // Request the data from the server
    const request = fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `${token}`,
        'Content-Type': 'application/json',
      },
    });

    const response = await request;

    if (response.status >= 200 && response.status < 300) {
      const text = await response.text();

      const json = JSON.parse(text);

      // Store the assets in cache if any were received
      if (_.size(json)) store(json, { season });

      // Return the list of assets
      return json;
    }
    const text = await response.text();
    console.error(text);
  } catch (error) {
    console.log(error);
  }

  return [];
}

/**
 * Fetch requested assets from the local redis cache or server
 * @param  {Object} options   Options
 * @param  {string} options.token User's authentication token
 * @param  {?number} options.rootAsset Filter by assetId
 * @param  {?boolean} options.shape Include shapes
 * @param  {?boolean} options.toFarmsOnly Return non-seasonal assets only if true
 * @param  {?string} options.category Filter by category
 * @return {Promise.<Array.<Object>>} List of assets returned from the redis cache
 */
export async function assets({
  token,
  rootAsset,
  season,
  shape,
  toFarmsOnly,
  category,
}) {
  if (!token) {
    throw Error('No token provided');
  }

  // Assure the user was logged in and authenticated
  const user = await currentUser({ token });

  // If filtering by rootAsset and season, determine whether this call has
  // been made before. If not, skip fetching from local cache.
  const fetched =
    season && rootAsset
      ? await redis.existsAsync(`f:${rootAsset}:${season}`)
      : true;

  let localPromise;

  // If the call has been made before, try fetching locally stored data
  if (fetched) {
    localPromise = new Promise(async resolve => {
      const data = await local(user, {
        token,
        rootAsset,
        season,
        shape,
        toFarmsOnly,
        category,
      });
      if (data.length) {
        console.log('Resolved local', rootAsset, season, category, toFarmsOnly);
        resolve(data);
      }
    });
  } else {
    // Otherwise just mark that we have now that we will
    redis.incr(`f:${rootAsset}:${season}`);
  }

  // Fetch data from backend server with provided query params
  const serverPromise = new Promise(async resolve => {
    const result = await server({
      token,
      rootAsset,
      season,
      shape,
      toFarmsOnly,
      category,
    });
    console.log('Resolved server', rootAsset, season, category, toFarmsOnly);
    resolve(result);
  });

  // Wait for local or server to resolve
  return Promise.race([serverPromise, localPromise].filter(p => p));
}
