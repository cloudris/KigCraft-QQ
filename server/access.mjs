// SPDX-License-Identifier: GPL-3.0-or-later
export function allowed(config,event){
  const group=String(event.group),user=String(event.user);
  return config.groups.includes(group)&&((config.publicGroups||[]).includes(group)||!config.users.length||config.users.includes(user));
}
