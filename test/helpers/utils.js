const fs = require('fs-extra')
const openwhisk = require('openwhisk')
const expandHomeDir = require('expand-home-dir')
const path = require('path')

const getWskPropsFile = () => {
    let wskprops = process.env.WSK_CONFIG_FILE
    if (!wskprops || !fs.existsSync(wskprops)) {
        const until = path.dirname(expandHomeDir('~'))
        let current = process.cwd()
        while (current !== '/' && current !== until) {
            wskprops = path.join(current, '.wskprops')

            if (fs.existsSync(wskprops))
                break
            current = path.dirname(current)
        }
    }
    return wskprops
}

const readWskProps = () => {
    const wskprops = getWskPropsFile()
    if (wskprops) {
        const propertiesParser = require('properties-parser')
        try {
            return propertiesParser.read(wskprops)
        } catch (e) {
            return null
        }
    }
    return null
}

const getWsk = () => {
    const wskprops = readWskProps()
    return openwhisk({
        api_key: wskprops.AUTH,
        apihost: wskprops.APIHOST,
        insecure: true
    });

}
exports.getWsk = getWsk

const before = ctx => () => {
    fs.mkdirsSync('test-results');
    ctx.cacheDir = fs.mkdtempSync('test-results/test');
    ctx.ow = getWsk();
}
exports.before = before;

const after = ctx => () => {
    if (ctx.cacheDir) {
        fs.removeSync(ctx.cacheDir);
    }
}
exports.after = after;
