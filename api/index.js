import stats from "./_handlers/stats.js";
import convertHeic from "./_handlers/convert-heic.js";
import shareRecipe from "./_handlers/share-recipe.js";
import shareList from "./_handlers/share-list.js";
import shareUpdate from "./_handlers/share-update.js";
import shareDelete from "./_handlers/share-delete.js";
import groupCreate from "./_handlers/group-create.js";
import groupInvite from "./_handlers/group-invite.js";
import groupRespond from "./_handlers/group-respond.js";
import groupMembers from "./_handlers/group-members.js";
import groupRemove from "./_handlers/group-remove.js";
import groupRename from "./_handlers/group-rename.js";
import groupDelete from "./_handlers/group-delete.js";
import groupShare from "./_handlers/group-share.js";
import groupShareList from "./_handlers/group-share-list.js";
import groupShareUpdate from "./_handlers/group-share-update.js";
import groupShareDelete from "./_handlers/group-share-delete.js";
import groupRoleUpdate from "./_handlers/group-role-update.js";

const routes = {
  "stats": stats,
  "convert-heic": convertHeic,
  "share-recipe": shareRecipe,
  "share-list": shareList,
  "share-update": shareUpdate,
  "share-delete": shareDelete,
  "group-create": groupCreate,
  "group-invite": groupInvite,
  "group-respond": groupRespond,
  "group-members": groupMembers,
  "group-remove": groupRemove,
  "group-rename": groupRename,
  "group-delete": groupDelete,
  "group-share": groupShare,
  "group-share-list": groupShareList,
  "group-share-update": groupShareUpdate,
  "group-share-delete": groupShareDelete,
  "group-role-update": groupRoleUpdate,
};

function getRoute(req) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathParam = url.searchParams.get("path") || "";
  return pathParam.replace(/^\/+/, "");
}

export default async function handler(req, res) {
  const route = getRoute(req);
  const fn = routes[route];
  if (!fn) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }
  return fn(req, res);
}
