const chai = require('chai');
chai.use(require('chai-arrays'));
chai.use(require('chai-string'));

const { expect } = chai;
const transform = require('../src/transform.js');
// const userMockData = require("./data/getUsersData.json");

DataFormatError = transform.DataFormatError;

describe('Transform API results to Ldap', () => {
  it('transformGroup from empty json object throws exception', () => {
    expect(() => transform.transformGroup({}, {}, '')).to.throw(DataFormatError);
  });
  it('transformGroup json object does contain data', () => {
    actual = transform.transformGroup(
      {
        id: 2,
        guid: 'FC8ED-B948-46AA-A48C-2CFD7DED910C',
        name: 'This Group',
      },
      {
        gid: 2,
        name: 'newGRoupname',
      },
      'sitename',
    );
    expect(actual.dn).to.startsWith('cn=newgroupname');
    expect(actual.attributes.cn).to.be.equal('newGRoupname');
    expect(actual.attributes.id).to.be.equal(2);
    expect(actual.attributes).to.haveOwnProperty('guid');
  });
  it('transformUser from empty json object throws exception', () => {
    expect(() => transform.transformUser({}, '')).to.throw(DataFormatError);
  });
  it('addConfigAttributes adds the attribute to any id', () => {
    const attributes = [{
      name: 'bbbrole',
      default: 'user',
      replacements: [
        {
          id: 5,
          value: 'admin',
        },
      ],
    }];
    const ctperson = {
      attributes: {
        id: 1,
      },
    };
    transform.addConfigAttributes(ctperson, attributes);
    expect(ctperson.attributes).to.haveOwnProperty('bbbrole');
    expect(ctperson.attributes.bbbrole).to.be.equal('user');
  });
  it('addConfigAttributes adds the replacment value', () => {
    const attributes = [{
      name: 'bbbrole',
      default: 'user',
      replacements: [
        {
          id: 5,
          value: 'admin',
        },
      ],
    }];
    const ctperson = {
      attributes: {
        id: 5,
      },
    };
    transform.addConfigAttributes(ctperson, attributes);
    expect(ctperson.attributes).to.haveOwnProperty('bbbrole');
    expect(ctperson.attributes.bbbrole).to.be.equal('admin');
  });
  it('transformUser minmal json object does not throw', () => {
    const person = {
      id: 144,
      guid: '274401F0-637A-4089-98DB-9345AF3B19D8',
      firstName: 'Peter',
      lastName: 'Pan',
      nickname: '',
      street: '',
      mobile: '',
      phonePrivate: '',
      zip: '',
      city: '',
      email: 'peter.pan@pan-demi.org',
      ncuid: 'peter.pan',
    };
    const actual = transform.transformUser(person, {
      ldap: { dc: 'site', userid_lowercase: false },
      attributes: [],
    });
    expect(actual.dn).to.startsWith('cn=peter.pan');
    expect(actual.attributes.cn).to.be.equal('peter.pan');
    expect(actual.attributes.uid).to.be.equal('peter.pan');
    expect(actual.attributes.id).to.be.equal(144);
  });
  it('connectUsersAndGroups adds group to person and person to group', () => {
    const membership = { personId: 12, groupId: 692 };
    const person = { dn: 'ab', attributes: { id: 12, memberOf: [] } };
    const group = { dn: 'cd', attributes: { id: 692, uniqueMember: [] } };
    transform.connectUsersAndGroups([membership], [group], [person], []);
    expect(person.attributes.memberOf).to.include('cd');
    expect(group.attributes.uniqueMember).to.include('ab');
  });
  it('connectUsersAndGroups adds objectClass to user for configured group', () => {
    const membership = { personId: 12, groupId: 692 };
    const person = { dn: 'ab', attributes: { id: 12, objectClass: [], memberOf: [] } };
    const group = { dn: 'cd', attributes: { id: 692, uniqueMember: [] } };
    const grptransf = { gid: 692, objectClass: 'ef' };
    transform.connectUsersAndGroups([membership], [group], [person], [grptransf]);
    expect(person.attributes.objectClass).to.include('ef');
  });
  it('addUsersAdminGroup - adds Ldap admin user', () => {
    const users = [];
    const ldapad = { dn: 'hey', attributes: { memberOf: [] } };
    const actual = transform.addUsersAdminGroup(users, ldapad, [4], 'admin', 'dcdc');
    expect(actual.dn).to.equal('cn=admin,ou=groups,dcdc');
    expect(actual.attributes.uniqueMember).to.have.length(1);
    expect(actual.attributes.uniqueMember[0]).to.equal(ldapad.dn);
  });
  it('addUsersAdminGroup - adds users with matching ids', () => {
    const users = [{ dn: 'hho', attributes: { id: 4, memberOf: [] } }];
    const ldapad = { dn: 'hey', attributes: { memberOf: [] } };
    const actual = transform.addUsersAdminGroup(users, ldapad, [4], 'admin', 'dcdc');
    expect(actual.dn).to.equal('cn=admin,ou=groups,dcdc');
    expect(actual.attributes.uniqueMember).to.have.length(2);
    expect(actual.attributes.uniqueMember).to.include('hho');
  });
});
