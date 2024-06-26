const axiosReal = require('axios').default;
const cookie = require('cookie');
const log = require('./logging');
const c = require('./constants');
const ctapi = require('./ctapi');

let axios = axiosReal;
const connectionPool = {};

exports.getEmptyConnection = (sitename, baseurl) => {
  const connection = {};
  connection.name = sitename;
  connection.baseurl = (baseurl || '');
  connection.cookie = '';
  connection.csrfToken = '';
  connection.loginPromise = null;
  connection.loginErrorCount = 0;
  connection.connected = false;
  return connection;
};

exports.getConnection = (site) => {
  if (!Object.prototype.hasOwnProperty.call(connectionPool, site.name)) {
    connectionPool[site.name] = this.getEmptyConnection(site.name, site.ct.url);
  }
  return connectionPool[site.name];
};

exports.isConnected = (sitename) => {
  if (!Object.prototype.hasOwnProperty.call(connectionPool, sitename)) {
    return false;
  }
  return connectionPool[sitename].csrfToken.length > 0;
};

exports.disconnect = (connection) => {
  connection.csrfToken = '';
};

exports.infoReal = async (baseurl) => {
  const request = {
    method: 'get',
    url: baseurl + c.API_SLUG + c.INFO_AP,
  };
  return ctapi.request(request);
};

exports.getCsrfTokenReal = async (baseurl, ck) => {
  const request = {
    method: 'get',
    url: baseurl + c.API_SLUG + c.CSRF_AP,
    headers: {
      Cookie: ck,
    },
    json: true,
  };
  return ctapi.request(request);
};

let getCsrfToken = this.getCsrfTokenReal;

const getCookie = (result) => result.headers['set-cookie'][0];

const cookieIsValid = (ck) => {
  const parsed = cookie.parse(ck);
  const expires = Date.parse(parsed.expires);
  if (expires > Date.now()) return true;
  log.info('Cookie expired');
  return false;
};

const getLoginRequest = (baseurl, user, password) => ({
  method: 'post',
  url: baseurl + c.API_SLUG + c.LOGIN_AP,
  data: {
    username: user,
    rememberMe: false,
    password,
  },
});

exports.authenticate = async (baseurl, user, password) => {
  log.debug(`Auth on ${baseurl} for ${user}`);
  const { data } = await ctapi.request(getLoginRequest(baseurl, user, password));
  return (data.status === 'success');
};

const loginfunc = async (conn, user, password) => {
  conn.csrfToken = '';
  const request = getLoginRequest(conn.baseurl, user, password);
  const successfunc = (result) => {
    conn.cookie = getCookie(result);
  };
  const { data } = await ctapi.request(request, successfunc);
  conn.csrfToken = (await getCsrfToken(conn.baseurl, conn.cookie)).data;
  conn.loginPromise = null;
  log.debug(`${conn.baseurl} - CT API login completed`);
  return data;
};

exports.loginPromiseReal = (conn, user, password) => {
  conn.loginPromise = loginfunc(conn, user, password);
  return conn.loginPromise;
};

let loginPromise = this.loginPromiseReal;

/**
 * Returns a promise for the login on the ChurchTools API.
 * If a pending login promise already exists, it is returned right away.
 */
exports.login = async (site) => {
  const conn = this.getConnection(site);
  if (conn.loginPromise) return Promise.resolve(conn.loginPromise);

  if (conn.loginErrorCount >= 3) throw ctapi.ChurchToolsFatalError('Too many failed logins in a row');

  let result = {};
  try {
    conn.loginPromise = loginPromise(conn, site.ct.user, site.ct.password);
    result = await conn.loginPromise;
  } catch (err) {
    result = err.response;
  }
  conn.loginPromise = null;

  return ctapi.result(
    result,
    () => { conn.loginErrorCount = 0; },
    () => { conn.loginErrorCount += 1; },
  );
};

exports.getPromiseReal = async (url, site) => {
  const conn = this.getConnection(site);
  let retryWithAuth = true;
  let result = {};
  while (retryWithAuth) {
    retryWithAuth = false;
    try {
      if (!this.isConnected(site.name) || !cookieIsValid(conn.cookie)) {
        log.debug('Try again to log in');
        await this.login(site);
      }
      const reqest = {
        url,
        headers: {
          Cookie: conn.cookie,
          'CSRF-Token': (conn.csrftoken ? conn.csrftoken : ''),
        },
        json: true,
      };
      log.debug(JSON.stringify(reqest));
      result = await axios(reqest);
      return ctapi.result(result);
    } catch (err) {
      if (err.name === 'ChurchToolsError' || (err.response && err.response.status === 401)) {
        this.disconnect(conn);
        retryWithAuth = true;
      } else throw err;
    }
  }
  return result;
};

let getPromise = this.getPromiseReal;
exports.get = (url, site) => getPromise(url, site);

// Mocks for internal functions
exports.setAxiosMock = (mock) => { axios = mock; };
exports.setLoginMock = (login) => { loginPromise = login; };
exports.setGetCsrfTokenMock = (getToken) => { getCsrfToken = getToken; };
exports.setGetMock = (get) => { getPromise = get; };
exports.resetMocks = () => {
  axios = axiosReal;
  getPromise = this.getPromiseReal;
  loginPromise = this.loginPromiseReal;
  getCsrfToken = this.getCsrfTokenReal;
};
