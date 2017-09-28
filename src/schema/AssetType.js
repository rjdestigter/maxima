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

import FieldInfoType from './FieldInfoType';

export const ShapeType = new GraphQLObjectType({
  name: 'Shape',

  fields: {
    id: { type: GraphQLInt },
    asset: { type: GraphQLInt },
    shapeData: { type: new GraphQLNonNull(GraphQLString) },
  },
});

export default new GraphQLObjectType({
  name: 'Asset',

  fields: {
    id: { type: GraphQLInt },
    label: { type: new GraphQLNonNull(GraphQLString) },
    category: { type: new GraphQLNonNull(GraphQLString) },
    parent: { type: GraphQLInt },
    shape: { type: ShapeType },
    field_info: { type: FieldInfoType },
  },
});
