const log = require('./logging');
const c = require('./constants');
const ctconn = require('./ctconnection');

const getGroupsPromiseReal = async (groupIds, ap, site, params, page) => {
  let url = `${site.ct.url}${c.API_SLUG}${ap}?page=${page}&limit=100`;
  if (params) {
    params.forEach((param) => {
      url = `${url}&${param.key}=${param.value}`;
    });
  }
  if (groupIds) {
    groupIds.forEach((id) => {
      url = url + c.IDS + id;
    });
  }
  return ctconn.get(url, site);
};
let getGroupsPromise = getGroupsPromiseReal;

exports.mockGetGroups = (mock) => {
  getGroupsPromise = mock;
};

const getGroupsPaginated = async (groupIds, ap, params, site) => {
  let data = [];
  let page = 1;
  let result = await getGroupsPromise(groupIds, ap, site, params, page);
  data = data.concat(result.data);
  if (!result.meta.pagination) return data;
  while (result.meta.pagination.current < result.meta.pagination.lastPage) {
    page += 1;
    result = await getGroupsPromise(groupIds, ap, site, params, page);
    data = data.concat(result.data);
  }
  return data;
};

exports.getPersonsInGroups = async (site) => {
  const result = await getGroupsPaginated(
    (site.users && site.users.groupIds) ? site.users.groupIds : null,
    c.GROUPMEMBERS_AP,
    [{ key: 'with_deleted', value: 'false' }],
    site,
  );
  const personIds = [];
  result.forEach((el) => {
    if (!personIds.includes(el.personId)) personIds.push(el.personId);
  });
  return personIds;
};

exports.getGroupMemberships = async (groupIds, site) => {
  const result = await getGroupsPaginated(
    groupIds,
    c.GROUPMEMBERS_AP,
    [{ key: 'with_deleted', value: 'false' }],
    site,
  );
  const members = [];
  result.forEach((el) => {
    members.push({
      personId: el.personId,
      groupId: el.groupId,
      groupTypeRoleId: el.groupTypeRoleId,
    });
  });
  return members;
};

exports.getGroups = async (groupIds, site) => {
  const result = await getGroupsPaginated(groupIds, c.GROUPS_AP, [], site);
  const groups = [];
  result.forEach((el) => {
    let skip = false;
    if (site.groups && site.groups.filter) {
      site.groups.filter.forEach((filter) => {
        if ((filter.type === el.information.groupTypeId) || (filter.id === el.id)) {
          skip = true;
        }
      });
    }
    if (skip) return;
    groups.push({
      id: el.id,
      guid: el.guid,
      name: el.name,
      roles: el.roles,
    });
  });
  return groups;
};

const getPersonRecord = (data) => {
  const person = {
    id: data.id,
    guid: data.guid,
    firstName: data.firstName,
    lastName: data.lastName,
    nickname: data.nickname,
    street: data.street,
    mobile: data.mobile,
    phonePrivate: data.phonePrivate,
    zip: data.zip,
    city: data.city,
    cmsuserid: (data.cmsUserId ? data.cmsUserId : ''),
    email: data.email,
  };
  if (data[c.LDAPID_FIELD] && data[c.LDAPID_FIELD].length > 0) {
    person[c.LDAPID_FIELD] = data[c.LDAPID_FIELD];
  }
  return person;
};

exports.getPersonRecordForId = async (id, site) => {
  const url = `${site.ct.url + c.API_SLUG + c.PERSONS_AP}/${id}`;
  const { data } = await ctconn.get(url, site);
  return getPersonRecord(data);
};

exports.getPersons = async (ids, site) => {
  const persons = [];
  let chunkedIds = [null];

  if (ids) {
    const clonedIds = [...ids];
    const chunkSize = clonedIds.length / 10;
    chunkedIds = [];
    for (let i = 0; i < chunkSize; i += 1) {
      chunkedIds.push(clonedIds.splice(0, 10));
    }
  }
  for await (const idarray of chunkedIds) {
    const result = await getGroupsPaginated(idarray, c.PERSONS_AP, [], site);
    result.forEach((person) => {
      persons.push(getPersonRecord(person));
    });
  }
  return persons;
};

exports.authWithChurchTools = (site) => (user, password) => (
  ctconn.authenticate(site.ct.url, user, password)
);

exports.getChurchToolsData = async (site) => {
  let allGroupsIds = null;
  let ctPersonIds = null;

  if (site.groups && site.groups.transform) {
    if (site.users && site.users.groupIds) {
      allGroupsIds = site.users.groupIds.map((id) => id);
    }
    site.groups.transform.forEach((element) => {
      if (!allGroupsIds.includes(element.gid)) {
        allGroupsIds.push(element.gid);
      }
    });
  }

  if (allGroupsIds) {
    log.info('Get Person IDs of Group Members from ChurchTools');
    ctPersonIds = await this.getPersonsInGroups(site);
  }

  log.info('Get Groups from ChurchTools');
  const ctGroups = await this.getGroups(allGroupsIds, site);
  log.info('Get Person Details from ChurchTools');
  const ctPersons = await this.getPersons(ctPersonIds, site);
  log.info('Get Group Memberships from ChurchTools');
  const ctGroupMembership = await this.getGroupMemberships(allGroupsIds, site);

  return {
    groups: ctGroups,
    persons: ctPersons,
    memberships: ctGroupMembership,
  };
};
