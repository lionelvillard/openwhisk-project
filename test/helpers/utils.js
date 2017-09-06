const fs = require('fs-extra')
const openwhisk = require('openwhisk')
const expandHomeDir = require('expand-home-dir')
const path = require('path')
const wskd = require('../../')

const before = ctx => async () => {
    fs.mkdirsSync('test-results');
    ctx.cacheDir = await fs.mkdtemp('test-results/test');
    ctx.ow = wskd.auth.initWsk();
    await wskd.undeploy({ ow: ctx.ow });
}
exports.before = before;

const after = ctx => () => {
    if (ctx.cacheDir) {
        fs.removeSync(ctx.cacheDir);
    }
}
exports.after = after;
