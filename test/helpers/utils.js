const fs = require('fs-extra')
const openwhisk = require('openwhisk')
const expandHomeDir = require('expand-home-dir')
const path = require('path')
const wskd = require('../../')
const rp = require('request-promise')

const before = ctx => async () => {

    fs.mkdirsSync('.workdir');
    ctx.cacheDir = await fs.mkdtemp('.workdir/test');
    const config = {};
    await wskd.init.init(config);

    if (!process.env.LOCALWSK || process.env.LOCALWSK === 'FALSE')
        await wskd.bx.initWsk(config, {home: '.', space: process.env.BLUEMIX_SPACE || 'openwhisk-wskp-test'});

    await wskd.undeploy.all(config);
    ctx.ow = config.ow;
}
exports.before = before;

const after = ctx => () => {
    if (ctx.cacheDir) {
        fs.removeSync(ctx.cacheDir);
    }
}
exports.after = after;

const invokeWebAction = async (ctx, actionName, params, contentExt) => {
    const action = await ctx.ow.actions.get({ actionName });
    const namespace = action.namespace;
    if (actionName.includes('/'))
        actionName = actionName.substring(actionName.indexOf('/') + 1);

    let query = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`);
    const url = `${ctx.ow.actions.client.options.api}web/${namespace}/${actionName}${contentExt}?${query}`;
    return rp(url);
}
exports.invokeWebAction = invokeWebAction;

const delay = async ms => new Promise(resolve => {
    setTimeout(() => resolve(), ms);
});
exports.delay = delay;

const httpGet = async (url, retry) => {
    try {
        return await rp(url);
    } catch (e) {
        if (retry <= 0) {
            throw e;
        }
        await delay(1000);
        return httpGet(url, retry - 1);
    }
}
exports.httpGet = httpGet;
