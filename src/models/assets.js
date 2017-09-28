import fetch from 'node-fetch';
import _ from 'lodash';

import redis from '../redis';
import { currentUser } from './currentUser';
import { spawn } from 'threads';

import getUrl from '../utils/url';
import buildAncestorsIndex from '../utils/buildAncestorsIndex';

const REGION = 'Region';
const HUB = 'Hub';
const TERRITORY = 'Territory';
const REPRESENTATIVE = 'Representative';
const GROWER = 'Grower';
const SALES_OFFICE = 'Sales Office';
const FARM = 'Farm';

let i = 1;

function debug(...args) {
  console.log(
    '------------------------------------------------------------------',
  );
  console.log(i, ...args);
  console.log(
    '------------------------------------------------------------------',
  );
  console.log(`\n`);
  i += 1;
}

function decode(object, nullable = null) {
  return (attr, objectKey = 'id') => {
    const value = object[attr];

    if (value == null) {
      return null;
    } else if (typeof value === 'boolean') {
      return value ? 1 : 0;
    } else if (typeof value === 'object') {
      return value[objectKey] || nullable;
    } else if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'number') {
      return value;
    }

    return nullable;
  };
}

function decodeFieldInfo(fieldInfo, nullable = null) {
  if (!fieldInfo) return null;

  const decoder = decode(fieldInfo, nullable);
  return {
    id: decoder('id'),
    field: decoder('field'),
    season: decoder('season'),
    LLD: decoder('LLD'),
    previous_crop: decoder('previous_crop'),
    previous_variety: decoder('previous_variety'),
    tillage: decoder('tillage'),
    current_crop: decoder('current_crop'),
    current_variety: decoder('current_variety'),
    yield_target: decoder('yield_target'),
    yield_target_units: decoder('yield_target_units'),
    field_area_units: decoder('field_area_units'),
    acres: decoder('acres'),
    dsm_required: decoder('dsm_required'),
    owned: decoder('owned'),
    seeding_date: decoder('seeding_date'),
    seeding_depth: decoder('seeding_depth'),
    row_spacing: decoder('row_spacing'),
    irrigated: decoder('irrigated'),
    continuous_cropping: decoder('continuous_cropping'),
    straw_removed: decoder('straw_removed'),
    date_harvested: decoder('date_harvested'),
    date_yield_processed: decoder('date_yield_processed'),
  };
}

function decodeAsset(asset, nullable = null) {
  if (!asset) return null;

  const decoder = decode(asset, nullable);
  return {
    id: decoder('id'),
    label: decoder('label'),
    category: decoder('category', 'name'),
    shape: asset.shape || null,
    parent: decoder('parent'),
    field_info: decodeFieldInfo(asset.field_info),
  };
}

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
 * @return {Promise.<?Object>}         The asset model or null if it is not able to find it.
 */
async function getAsset(assetId) {
  const {
    id,
    label,
    parent,
    category,
    shape,
    field_info,
  } = await redis.hgetallAsync(`asset:${assetId}`);

  return {
    id: Number(id) || null,
    label: label || '',
    parent: Number(parent) || null,
    category,
    shape: await getShape(shape),
    field_info: (field_info && JSON.parse(field_info)) || null,
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
    debug('Rebuild indexes.');
    const { ancestors, decendants } = buildAncestorsIndex(assetsById, 'id');
    debug('Indexes rebuilt.');

    _.forEach(ancestors, (ancestorIds, assetId) => {
      if (_.size(ancestorIds))
        redis.sadd(`ancestors:${assetId}`, ...ancestorIds);
    });

    debug('Ancestry Indexes stored in cache.');

    _.forEach(decendants, (decendantIds, assetId) => {
      if (_.size(decendantIds))
        redis.sadd(`decendants:${assetId}`, ...decendantIds);
    });

    debug('Decendants Indexes stored in cache.');
  } catch (error) {
    debug(error);
  }
}

export async function getKeyToPermittedIds(user, read = 'asset') {
  debug('getKeyToPermittedIds', read);
  const tempKey = `temp1:${user.id}:${Math.random()}`;

  // List of all assetIds attached to permissions that have asset read.
  const permittedRootIds = await redis.smembersAsync(
    `perm:${read}:read:${user.id}`,
  );

  if (permittedRootIds.length) {
    // List of keys linking to each set of decendants for each assetId with read permission.
    const permittedSetKeys = _.map(permittedRootIds, id => `decendants:${id}`);

    // Store a temporary union of all asset ids the user has access too.
    await redis.sunionstoreAsync(tempKey, ...permittedSetKeys);
    await redis.saddAsync(tempKey, ...permittedRootIds);
    debug('getKeyToPermittedIds', tempKey);
    return tempKey;
  }

  return null;
}

/**
 * Store a list of assets in redis
 * @param  {Array} data   List of assets received from the server
 * @param  {?number} season Optional seasonId assets were filtered by
 * @return {Promise.<>}        void
 */
export async function store(data, { season }) {
  debug('Storing assets');

  const promises = data.map(async asset => {
    // Destructure asset attributes
    const currentPromises = [];
    const { id, label, parent, category, shape } = asset;
    const field_info = decodeFieldInfo(asset.field_info);

    // Add the assetId to the set of assetIds in redis
    currentPromises.push(redis.saddAsync('assets', id));

    // Add the assetId to the set of assetIds by category in redis
    if (category) currentPromises.push(redis.saddAsync(category, id));

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
      currentPromises.push(redis.saddAsync(`season:${season}`, id));
    }

    // Store the asset in redis
    currentPromises.push(
      redis.hmsetAsync(`asset:${id}`, [
        'id',
        id || '',
        'label',
        label || '',
        'parent',
        parent || '',
        'category',
        (category && category.name) || category || '',
        'shape',
        (shape && shape.id) || '',
        'field_info',
        (field_info && JSON.stringify(field_info)) || '',
      ]),
    );

    // Store the shape in redis if it was received as well
    if (shape) {
      // Add the shapeId to the set of shapeIds in redis

      currentPromises.push(
        redis.saddAsync('shapes', shape.id),
        // Store the shape
        redis.hmsetAsync(`shape:${shape.id}`, [
          'id',
          shape.id,
          'shapeData',
          shape.shapeData,
        ]),
      );
    }

    return Promise.all(currentPromises);
  });

  await Promise.all(promises);

  const rebuild = await redis.getAsync('rebuild:index');

  if (rebuild === '13') {
    return;
  }

  await rebuildIndexes();
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
  { rootAsset, season, toFarmsOnly, category },
) {
  try {
    if (!user && user.id) {
      throw Error('No user provided');
    }

    const tempKey1 = `temp1:${user.id}:${Math.random()}`;
    const tempKey2 = await getKeyToPermittedIds(user);

    if (tempKey2) {
      let assetIds;
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
        const list = await Promise.all(assetIds.map(getAsset));
        return [list.filter(asset => asset), Promise.resolve(true)];
      }
    }
  } catch (error) {
    debug('Error resolving local Assets');
    debug(error);
  }

  return [[], Promise.resolve(true)];
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
  const path = rootAsset || season ? 'asset/field/' : 'asset/';

  const url = getUrl({
    path,
    queryParams: {
      rootAsset,
      season,
      shape: true,
      toFarmsOnly,
      category,
    },
  });

  debug('Fetching', url);

  try {
    // Request the data from the server
    const request = fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `${toFarmsOnly
          ? 'Token 0d7d912d9e71f061372bfaa5e2cc670ff2b232c6'
          : token}`,
        'Content-Type': 'application/json',
      },
    });

    const response = await request;

    if (response.status >= 200 && response.status < 300) {
      const text = await response.text();

      const json = JSON.parse(text);

      // Store the assets in cache if any were received
      if (_.size(json)) {
        debug('Received Assets', json.length);
        const decoded = _.map(json, asset => decodeAsset(asset));
        return [decoded, store(decoded, { season })];
      }
    } else {
      const text = await response.text();
      debug('400 Assets', text);
    }
  } catch (error) {
    debug('500 Assets', error);
  }

  return [[], Promise.resolve(true)];
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
export async function assets(
  { token, rootAsset, season, shape, toFarmsOnly, category },
  localOnly = false,
) {
  if (!token) {
    throw Error('No token provided');
  }

  // Assure the user was logged in and authenticated
  const user = await currentUser({ token });

  // If filtering by rootAsset and season, determine whether this call has
  // been made before. If not, skip fetching from local cache.
  const fetchedBySeasonAndAsset =
    season && rootAsset
      ? await redis.existsAsync(`f:${rootAsset}:${season}`)
      : true;

  let localPromise;

  // If the call has been made before, try fetching locally stored data
  if (localOnly || fetchedBySeasonAndAsset) {
    localPromise = new Promise(async resolve => {
      const [data] = await local(user, {
        token,
        rootAsset,
        season,
        shape,
        toFarmsOnly,
        category,
      });

      if (data.length) {
        console.log(
          'Resolved local',
          `rootAsset: ${rootAsset}`,
          `season: ${season}`,
          `category: ${category}`,
          `toFarmsOnly: ${toFarmsOnly}`,
        );

        resolve([data, Promise.resolve(true)]);
      } else if (localOnly) {
        resolve([[], Promise.resolve(true)]);
      }
    });
  } else {
    // Otherwise just mark that we have now that we will
    redis.incr(`f:${rootAsset}:${season}`);
  }

  let serverResolved = false;

  // Fetch data from backend server with provided query params
  const serverPromise =
    !localOnly &&
    new Promise(async resolve => {
      const result = await server({
        token,
        rootAsset,
        season,
        shape,
        toFarmsOnly,
        category,
      });
      debug(
        'Resolved server',
        `rootAsset: ${rootAsset}`,
        `season: ${season}`,
        `category: ${category}`,
        `toFarmsOnly: ${toFarmsOnly}`,
      );
      serverResolved = true;
      resolve(result);
    });

  // Wait for local or server to resolve

  const [response, storePromise] = await Promise.race(
    [serverPromise, localPromise].filter(p => p),
  );

  debug('Assets Resolved', serverResolved);

  if (toFarmsOnly && serverResolved) {
    debug('toFarmsOnly resolved, returning local');

    await storePromise;

    return assets(...arguments, true);
  }

  return response;
}
