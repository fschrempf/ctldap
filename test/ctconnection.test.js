const chai = require('chai');

const { expect } = chai;
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);

const log = require('../src/logging');
const ctapi = require('../src/ctapi');
const ctconn = require('../src/ctconnection');

ChurchToolsError = ctapi.ChurchToolsError;
ChurchToolsFatalError = ctapi.ChurchToolsFatalError;

const site = {
  name: 'nopf',
  ct: {
    user: 'user',
    password: 'pass',
    url: 'https://nopf.church.toys/',
  },
};

describe('Church Tools Connection', () => {
  before(() => {
    log.logger.level = 'silent';
  });

  it('getConnection for new site returns empty connection object', () => {
    const mysite = { ...site };
    mysite.name = 'asdfgggg';
    actual = ctconn.getConnection(mysite);
    expect(actual).to.have.property('loginPromise');
    expect(actual.loginPromise).to.equal(null);
    expect(actual.name).to.equal(mysite.name);
  });
  it('getConnection returns existing connection object', () => {
    const mysite = { ...site };
    mysite.name = 'asdfggg';
    expected = ctconn.getConnection(mysite);
    actual = ctconn.getConnection(mysite);
    expect(actual).to.equal(expected);
  });

  it('getConnection returns new one even if there is an existing connection object', () => {
    const mysite = { ...site };
    mysite.name = 'asdggg';
    notexpected = ctconn.getConnection(site);
    actual = ctconn.getConnection(mysite);
    expect(actual).to.not.equal(notexpected);
  });

  it('login failed - throws ChurchToolsError', () => {
    const mysite = { ...site };
    mysite.name = 'ola';
    ctconn.setLoginMock((c, b, u, p) => new Promise((resolve) => {
      resolve({ message: 'login failed' });
    }));
    expect(ctconn.login(mysite)).to.eventually.throw(ChurchToolsError);
  }).timeout(2000);

  it('login - prevents from too many login attempts', () => {
    const mysite = { ...site };
    mysite.name = 'ola';
    ctconn.setLoginMock((c, b, u, p) => new Promise((resolve) => {
      resolve({ message: 'login failed' });
    }));
    expect(
      new Promise(async (resolve) => {
        let i = 0;
        while (i < 5 && failed) {
          try {
            await ctconn.login(mysite);
          } catch (ChurchToolsError) {
          }
          i++;
        }
        resolve();
      }),
    ).to.eventually.throw(ChurchToolsFatalError);
  }).timeout(2000);

  it('get - logs in, if no session', async () => {
    const expected = { data: { status: 'success', data: { test: 'test' } } };
    let loginCalled = false;
    ctconn.setLoginMock((c, b, u, p) => {
      loginCalled = true;
      return Promise.resolve({ data: {} });
    });
    ctconn.setAxiosMock((obj) => Promise.resolve(expected));
    const actual = await ctconn.get('url', site);
    expect(loginCalled).to.equal(true);
    expect(actual).to.equal(expected.data);
  });

  it('get - trys to log in multiple times', async () => {
    const expected = { data: { status: 'success', data: { test: 'test' } } };
    const newsite = { ...site };
    newsite.name = 'amprf';
    let loginCalls = 0;
    let axiosCalled = false;
    function LoginException() {
      const err = new Error('Kommst net rein');
      err.response = { status: 400 };
      return err;
    }
    ctconn.setLoginMock((c, b, u, p) => {
      loginCalls++;
      if (loginCalls < 3) throw new LoginException();
      return Promise.resolve({ data: {} });
    });
    ctconn.setAxiosMock((obj) => {
      axiosCalled = true;
      if (loginCalls < 2) return Promise.resolve(false);
      return Promise.resolve(expected);
    });
    const actual = await ctconn.get('url', newsite);
    expect(loginCalls).to.equal(3);
    expect(axiosCalled).to.equal(true);
    expect(actual).to.equal(expected.data);
  });

  it('get - trys to log in gives up after n times', async () => {
    const expected = { data: { status: 'success', data: { test: 'test' } } };
    const newsite = { ...site };
    newsite.name = 'amprdff';
    loginCalls = 0;
    function LoginException() {
      const err = new Error('Kommst net rein');
      err.response = { status: 401 };
      return err;
    }
    ctconn.setLoginMock((c, b, u, p) => {
      loginCalls++;
      throw new LoginException();
    });
    ctconn.setAxiosMock((obj) => Promise.resolve(false));
    expect(ctconn.get('url', newsite)).to.eventually.throw(ChurchToolsFatalError);
  });
});
