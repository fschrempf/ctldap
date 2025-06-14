const ldapEsc = require('ldap-escape');
const crypto = require('crypto');
const log = require('./logging');
const c = require('./constants');

class DataFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataFormatError';
  }
}
exports.lowercase = (s) => (typeof s === 'string' ? s.toLowerCase() : s);
exports.identity = (s) => s;
exports.stringConvLowercaseUmlaut = (str) => str
  .toLowerCase()
  .replace('ö', 'oe')
  .replace('ä', 'ae')
  .replace('ü', 'ue')
  .replace('ß', 'ss');
exports.generateUUID = () => crypto.randomUUID();

exports.uniqueEmails = (users) => {
  const mails = {};
  return users.filter((user) => {
    if (!user.attributes.email) {
      return false;
    }
    const result = !(user.attributes.email in mails);
    mails[user.attributes.email] = true;
    return result;
  });
};

exports.getRootObj = (dc, admin, o) => {
  // ldapEsc.dn`cn=root`;
  const result = {
    users: {
      dn: `ou=${c.LDAP_OU_USERS},${dc}`,
      attributes: {
        o,
        ou: c.LDAP_OU_USERS,
        cn: c.LDAP_OU_USERS,
        elements: [],
      },
    },
    groups: {
      dn: `ou=${c.LDAP_OU_GROUPS},${dc}`,
      attributes: {
        o,
        ou: c.LDAP_OU_GROUPS,
        cn: c.LDAP_OU_GROUPS,
        elements: [],
      },
    },
    dsn: {
      dn: dc,
      attributes: {
        creatorsname: admin,
        entrydn: dc,
        entryuuid: this.generateUUID(),
        o,
        namingContexts: [dc],
        objectclass: ['top', 'RootDSE', 'organization'],
        structuralobjectclass: 'organization',
        subschemasubentry: 'cn=Subschema',
        elements: [],
      },
    },
  };
  result.dsn.attributes.elements.push(result.users, result.groups);
  return result;
};

exports.getAdmin = (cn, dc) => {
  const dn = `${ldapEsc.dn`cn=${cn}`},${dc}`;
  return {
    dn,
    attributes: {
      cn,
      displayname: 'Admin',
      id: 0,
      uid: 'Admin',
      bbbrole: 'admin',
      entryUUID: 'admin0',
      givenname: 'Administrator',
      objectClass: [
        c.LDAP_OBJCLASS_USER,
        'simpleSecurityObject',
        'organizationalRole',
      ],
      memberOf: [],
    },
  };
};

exports.getAdminGroup = (cn, dc) => {
  const dn = `${ldapEsc.dn`cn=${cn}`},ou=${c.LDAP_OU_GROUPS},${dc}`;
  return {
    dn,
    attributes: {
      cn,
      id: 0,
      displayname: 'Administrators',
      entryUUID: 'admingroup0',
      objectClass: [c.LDAP_OBJCLASS_GROUP],
      uniqueMember: [],
    },
  };
};

exports.setUid = (ctpserson) => {
  if (ctpserson[c.LDAPID_FIELD] && ctpserson[c.LDAPID_FIELD].length > 0) {
    return ctpserson[c.LDAPID_FIELD];
  }
  return this.stringConvLowercaseUmlaut(
    `${ctpserson.firstName}.${ctpserson.lastName}`,
  );
};

exports.addConfigAttributes = (ctperson, attributes) => {
  const p = ctperson;

  if (!attributes) return;

  attributes.forEach((attribute) => {
    p.attributes[attribute.name] = attribute.default;
    const replacment = attribute.replacements.find(
      (rep) => rep.id === p.attributes.id,
    );
    if (replacment) p.attributes[attribute.name] = replacment.value;
  });
};

exports.transformUser = (ctpserson, site) => {
  let result = {};
  if (!ctpserson || !ctpserson.id) throw new DataFormatError('Empty user object');

  let cn = this.setUid(ctpserson);
  if (site.ldap.userid_lowercase) {
    cn = this.lowercase(cn);
  }
  const dn = `${ldapEsc.dn`cn=${cn}`},ou=${c.LDAP_OU_USERS},${site.ldap.dc}`;
  result = {
    dn: this.lowercase(dn),
    attributes: {
      cn,
      id: ctpserson.id,
      displayname: `${ctpserson.firstName} ${ctpserson.lastName}`,
      uid: cn,
      guid: ctpserson.guid,
      entryUUID: ctpserson.guid,
      givenname: ctpserson.firstName,
      street: ctpserson.street,
      telephoneMobile: ctpserson.mobile,
      telephoneHome: ctpserson.phonePrivate,
      postalCode: ctpserson.zip,
      l: ctpserson.city,
      sn: ctpserson.lastName,
      email: this.lowercase(ctpserson.email),
      mail: this.lowercase(ctpserson.email),
      objectClass: [c.LDAP_OBJCLASS_USER, 'person', 'organizationalPerson', 'user'],
      memberOf: [],
    },
  };
  this.addConfigAttributes(result, site.attributes);
  return result;
};

exports.transformGroup = (ctgroup, grtransform, dc) => {
  if (!ctgroup || !ctgroup.id) throw new DataFormatError('Group from CT was emtpy');
  const cn = grtransform && grtransform.name ? grtransform.name : ctgroup.name;
  const dn = `${ldapEsc.dn`cn=${cn}`},ou=${c.LDAP_OU_GROUPS},${dc}`;
  return {
    dn: this.lowercase(dn),
    attributes: {
      cn,
      displayname: cn,
      id: ctgroup.id,
      guid: ctgroup.guid,
      entryUUID: ctgroup.guid,
      nsuniqueid: `g${ctgroup.id}`,
      objectClass: [c.LDAP_OBJCLASS_GROUP],
      uniqueMember: [],
    },
  };
};

exports.transformRole = (grp, ctrole, dc) => {
  if (!grp || !grp.attributes.id) throw new DataFormatError('Group from CT was emtpy');
  if (!ctrole || !ctrole.id) throw new DataFormatError('Role from CT was emtpy');
  const cn = `${grp.attributes.displayname} ${ctrole.name}`;
  const dn = `${ldapEsc.dn`cn=${cn}`},ou=${c.LDAP_OU_GROUPS},${dc}`;
  return {
    dn: this.lowercase(dn),
    attributes: {
      cn,
      displayname: cn,
      baseGroupId: grp.attributes.id,
      groupTypeRoleId: ctrole.groupTypeRoleId,
      id: ctrole.id,
      nsuniqueid: `r${ctrole.id}`,
      objectClass: [c.LDAP_OBJCLASS_GROUP],
      uniqueMember: [],
    },
  };
};

exports.addUsersAdminGroup = (users, ldapadmin, ids, cn, dc) => {
  const admingroup = this.getAdminGroup(cn, dc);
  if (ids) {
    users.forEach((user) => {
      if (ids.includes(user.attributes.id)) {
        admingroup.attributes.uniqueMember.push(user.dn);
        user.attributes.memberOf.push(admingroup.dn);
      }
    });
  }
  admingroup.attributes.uniqueMember.push(ldapadmin.dn);
  ldapadmin.attributes.memberOf.push(admingroup.dn);
  return admingroup;
};

exports.connectUsersAndGroups = (
  memberships,
  groups,
  users,
  transformGroups,
) => {
  groups.forEach((group) => {
    let objClassGrpMem = null;

    if (transformGroups) {
      objClassGrpMem = transformGroups.find(
        (t) => t.gid === group.attributes.id,
      );
    }

    memberships
      .filter(
        (m) => (m.groupId === group.attributes.id
               || (group.attributes.groupTypeRoleId
               && (m.groupTypeRoleId === group.attributes.groupTypeRoleId))),
      )
      .forEach((membership) => {
        const user = users.find((u) => u.attributes.id === membership.personId);
        if (!user) return;
        if (group.attributes.baseGroupId
            && group.attributes.baseGroupId !== membership.groupId) return;

        user.attributes.memberOf.push(group.dn);
        if (objClassGrpMem && Object.prototype.hasOwnProperty.call(objClassGrpMem, 'objectClass')) {
          user.attributes.objectClass.push(objClassGrpMem.objectClass);
        }
        group.attributes.uniqueMember.push(user.dn);
      });
  });
};

exports.getLdapGroupsWithoutMembers = (ctgroups, transformGroups, roles, dc) => {
  const groups = [];
  ctgroups.forEach((element) => {
    let grptransform = null;

    if (transformGroups) {
      grptransform = transformGroups.find((t) => t.gid === element.id);
    }

    const grp = this.transformGroup(element, grptransform, dc);
    groups.push(grp);

    if (roles && roles.export && element.roles) {
      element.roles.forEach((role) => {
        if (!role.isActive) return;
        let skip = false;
        roles.filter.forEach((filter) => {
          if ((filter.type === 'all' || filter.type === role.groupTypeId)
              && filter.role === role.name) {
            skip = true;
          }
        });
        if (skip) return;
        const rolegrp = this.transformRole(grp, role, dc);
        groups.push(rolegrp);
      });
    }
  });
  return groups;
};

exports.getLdapUsers = (ctpersons, site) => {
  const users = [];
  ctpersons.forEach((element) => {
    const user = this.transformUser(element, site);
    users.push(user);
  });
  return users;
};

exports.getLdapData = (site, churchtoolsdata, adminuser) => {
  let transformGroups = null;

  if (site.groups && site.groups.transform) {
    transformGroups = site.groups.transform;
  }

  let groups = this.getLdapGroupsWithoutMembers(
    churchtoolsdata.groups,
    transformGroups,
    site.roles,
    site.ldap.dc,
  );

  const users = this.getLdapUsers(
    churchtoolsdata.persons,
    site,
  );

  this.connectUsersAndGroups(
    churchtoolsdata.memberships,
    groups,
    users,
    transformGroups,
  );

  if (site.ldap.skip_empty_groups) {
    log.info('Skipping export of empty LDAP groups');
    groups = groups.filter((group) => (group.attributes.uniqueMember.length > 0));
  }

  groups.push(
    this.addUsersAdminGroup(
      users,
      adminuser,
      site.adminGroup.members,
      site.adminGroup.cn,
      site.ldap.dc,
    ),
  );

  return {
    users,
    groups,
  };
};
