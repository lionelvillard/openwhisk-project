/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as mime from 'mime';
import * as fs from 'fs';
import * as path from 'path';

// --- Plugin export

export function actionContributor(config, deployment, pkgName: string, actionName: string, action) : any {
    // Simple form?
    if (typeof action.web === 'string') {
        const contentType  = mime.getType(action.web);
        if (!contentType) {
            throw `Content type not recognized for ${action.web}`;
        }

        try {
            const location = path.resolve(config.basePath, action.web);
            const content = fs.readFileSync(location);
            const body = new Buffer(content).toString(isBinary(contentType) ? 'base64' : 'utf-8');

            return [{
                kind: "action",
                pkgName,
                name: actionName,
                body: {
                    web: {
                        headers: { 'Content-Type': contentType },
                        body
                    }
                }
            }];
        } catch (e) {
            throw e; 
        }
    } else {
        // Expanded form

        const headers = action.web.headers;
        const statusCode = action.web.statusCode || 200;
        const body = action.web.body.replace(/`/g, '\\`');

        return [{
            kind: "action",
            pkgName,
            name: actionName,
            body: {
                kind: 'nodejs',
                code: `function main() {
                          return { 
                            headers: ${JSON.stringify(headers)},
                            statusCode: ${statusCode},
                            body: \`${body}\`
                          } 
                       }`,
                annotations: {
                    'web-export': true
                }
            }
        }];
    }
}

const mediaTypes = {
    "application/atom+xml": false,
    "application/base64": true,
    "application/excel": true,
    "application/font-woff": true,
    "application/gnutar": true,
    "application/java-archive": true,
    "application/javascript": false,
    "application/json": true, // we treat JSON as binary, since its encoding is not variable but defined by RFC4627
    "application/json-patch+json": true, // we treat JSON as binary, since its encoding is not variable but defined by RFC4627
    "application/lha": true,
    "application/lzx": true,
    "application/mspowerpoint": true,
    "application/msword": true,
    "application/octet-stream": true,
    "application/pdf": true,
    "application/postscript": true,
    "application/rss+xml": false,
    "application/soap+xml": false,
    "application/vnd.api+json": true, // we treat JSON as binary, since its encoding is not variable but defined by RFC4627
    "application/vnd.google-earth.kml+xml": false,
    "application/vnd.google-earth.kmz": true,
    "application/vnd.ms-fontobject": true,
    "application/vnd.oasis.opendocument.chart": true,
    "application/vnd.oasis.opendocument.database": true,
    "application/vnd.oasis.opendocument.formula": true,
    "application/vnd.oasis.opendocument.graphics": true,
    "application/vnd.oasis.opendocument.image": true,
    "application/vnd.oasis.opendocument.presentation": true,
    "application/vnd.oasis.opendocument.spreadsheet": true,
    "application/vnd.oasis.opendocument.text": true,
    "application/vnd.oasis.opendocument.text-master": true,
    "application/vnd.oasis.opendocument.text-web": true,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": true,
    "application/vnd.openxmlformats-officedocument.presentationml.slide": true,
    "application/vnd.openxmlformats-officedocument.presentationml.slideshow": true,
    "application/vnd.openxmlformats-officedocument.presentationml.template": true,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": true,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.template": true,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.template": true,
    "application/x-7z-compressed": true,
    "application/x-ace-compressed": true,
    "application/x-apple-diskimage": true,
    "application/x-arc-compressed": true,
    "application/x-bzip": true,
    "application/x-bzip2": true,
    "application/x-chrome-extension": true,
    "application/x-compress": true,
    "application/x-compressed": true,
    "application/x-debian-package": true,
    "application/x-dvi": true,
    "application/x-font-truetype": true,
    "application/x-font-opentype": true,
    "application/x-gtar": true,
    "application/x-gzip": true,
    "application/x-latex": true,
    "application/x-rar-compressed": true,
    "application/x-redhat-package-manager": true,
    "application/x-shockwave-flash": true,
    "application/x-tar": true,
    "application/x-tex": true,
    "application/x-texinfo": true,
    "application/x-vrml": false,
    "application/x-www-form-urlencoded": false,
    "application/x-x509-ca-cert": true,
    "application/x-xpinstall": true,
    "application/xhtml+xml": false,
    "application/xml-dtd": false,
    "application/xml": false,
    "application/zip": true
}

function isBinary(contentType) {
    if (contentType.startsWith('text/') || contentType.startsWith('message/'))
        return false;
    if (contentType.startsWith('audio/') || contentType.startsWith('image/') || contentType.startsWith('video/'))
        return true;
    return mediaTypes[contentType];
}