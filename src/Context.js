/**
 * Node.js API Starter Kit (https://reactstarter.com/nodejs)
 *
 * Copyright © 2016-present Kriasoft, LLC. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */

/* @flow */

import DataLoader from 'dataloader';
import type { request as Request } from 'express';
import fetch from 'node-fetch';
import { mapTo } from './utils';

class Context {
  request: Request;
  user: any;

  constructor(request: Request) {
    this.request = request;
  }

  token() {
    return this.request.header('Authorization');
  }

  /*
   * Data loaders to be used with GraphQL resolve() functions. For example:
   *
   *   resolve(post, args, { userById }) {
   *     return userById.load(post.author_id);
   *   }
   *
   * For more information visit https://github.com/facebook/dataloader
   */

  assetById = new DataLoader(keys =>
    fetch('https://dev.granduke.net/asset/?toFarmsOnly=True&shape=True', {
      headers: {
        Authorization: 'Token 0d7d912d9e71f061372bfaa5e2cc670ff2b232c6',
      },
    }).then(mapTo(keys, x => x.id, 'Asset')),
  );
}

export default Context;
