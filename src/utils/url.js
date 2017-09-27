import _ from 'lodash';

const SERVER = 'dev.granduke.net';
const PROTOCOL = 'https';

export default function({
  id,
  queryParams: maybeQueryParams = {},
  url: maybeUrl,
  path: maybePath = url,
  protocol = PROTOCOL,
  server = SERVER,
  token,
}) {
  const [path, query] = `${maybePath || ''}`.split('?');
  const paths = _.filter(path.match(/\w+/g));
  const queries = _.map(_.filter(`${query || ''}`.split('&')), q =>
    q.split('='),
  );

  const queryParams = {
    ...maybeQueryParams,
    ..._.fromPairs(queries),
  };

  if (token) {
    queryParams.token = token;
  }

  let url = `${protocol}://${server}/${paths.join('/')}/`;
  if (id) {
    url += id;
  }

  if (_.size(queryParams)) {
    const tuples = _.toPairs(queryParams).filter(t => t[1]);

    const queryString = _.map(
      tuples,
      ([key, value]) => `${key}=${value === true ? 'True' : value}`,
    ).join('&');
    return `${url}?${queryString}`;
  }

  return url;
}
