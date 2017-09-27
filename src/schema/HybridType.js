/**
 * Node.js API Starter Kit (https://reactstarter.com/nodejs)
 *
 * Copyright © 2016-present Kriasoft, LLC. All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.txt file in the root directory of this source tree.
 */

/* @flow */

import {
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLInt,
  GraphQLString,
} from 'graphql';

export default new GraphQLObjectType({
  name: 'Hybrid',

  fields: {
    id: { type: GraphQLInt },
    name: { type: new GraphQLNonNull(GraphQLString) },
    crop: { type: GraphQLInt },
  },
});
