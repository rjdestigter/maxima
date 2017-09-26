import fetch from 'node-fetch';
import redis from '../redis';

export async function store(user, token) {
  await Promise.all([
    redis.saddAsync('users', user.id),
    redis.setAsync(`user:${token}`, user.id),
  ]);

  return redis.hmsetAsync(`user:${user.id}`, [
    'id',
    user.id,
    'username',
    user.user.username,
  ]);
}

export async function local({ token }) {
  const userId = await redis.getAsync(`user:${token}`);

  if (userId) {
    const user = await redis.hgetallAsync(`user:${userId}`);

    if (user) {
      return user;
    }
  }

  return null;
}

export async function server({ token }) {
  try {
    const request = fetch('https://dev.granduke.net/client/currentuser/', {
      method: 'GET',
      headers: {
        Authorization: `${token}`,
        'Content-Type': 'application/json',
      },
    });

    const response = await request;
    const user = await response.json();

    await store(user, token);

    return user;
  } catch (error) {
    console.log(error);
  }

  return null;
}

export async function storePermissions({ permissions, user }) {
  await Promise.all(
    permissions.map(async permission => {
      const { id, asset, perm } = permission;

      await redis.saddAsync('perm', id);
      await redis.saddAsync(`perm:${user.id}`, id);

      return redis.hmsetAsync(`perm:${id}`, [
        'id',
        id || '',
        'asset',
        asset.id,
        'perm',
        JSON.stringify(perm),
      ]);
    }),
  );
}

export async function getPermissions({ user, token }) {
  try {
    const request = fetch(
      'https://dev.granduke.net/permission/' + `?clientID=${user.id}&assetID=1`,
      {
        method: 'GET',
        headers: {
          Authorization: `${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const response = await request;
    const permissions = await response.json();

    return storePermissions({ permissions, user });
  } catch (error) {
    console.log(error);
  }

  return null;
}

export async function currentUser({ token }) {
  let user;

  user = await local({ token });

  if (!user) {
    console.log('Fetching current user from server.');
    user = await server({ token });

    if (user) {
      await getPermissions({ user, token });
    }
  } else {
    console.log('Found local user');
  }

  return user;
}
