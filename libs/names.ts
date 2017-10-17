/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
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


/*
 Parse a (possibly fully qualified) resource name into namespace and name components.

 Examples:
 foo => {namespace: "_", name: "foo"}
 pkg/foo =>  {namespace: "_", package: "pkg", name: "foo"}
 /ns/foo => {namespace: ns, name: "foo"}
 /ns/pkg/foo => {namespace: ns, package: pkg, pkg/foo}
 */
export function parseQName(qname) {
    qname = qname.trim();
    let parts = qname.split('/');
    let hasns = parts[0] === '';

    let namespace = (hasns) ? parts[1] : undefined;
    let pkg = undefined;
    let name = undefined;
    switch (parts.length) {
        case 1:
            if (hasns)
                throw `invalid entity name '${qname}'`;
            name = parts[0];
            break;
        case 2:
            pkg = parts[0];
            name = parts[1];
            break;
        case 3:
            name = parts[2]
            break;
        case 4:
            pkg = parts[2];
            name = parts[3];
            break;
        default:
            throw `Invalid entity name '${qname}`;
    }
    // TODO: check name

    return { namespace, pkg, name };
};

// Make sure name if fully qualified
export function resolveQName(qname, namespace, packageName) {
    const parts = resolveQNameParts(qname, namespace, packageName);
    return makeQName(parts.namespace, parts.pkg, parts.name);
};

// Make sure name if fully qualified, return parts
export function resolveQNameParts(qname, namespace, packageName) {
    let parts = parseQName(qname);
    parts.namespace = parts.namespace || namespace;
    parts.pkg = parts.pkg || packageName;
    return parts;
};

// Make qname from parts
export function makeQName(namespace, packageName, actionName) {
    return `/${namespace}${packageName ? `/${packageName}`: ''}/${actionName}`;
};

// Compute relative qname /_/ 
export function relativeQName(qname, namespace, packageName) {
    const parts = parseQName(qname);
    if (parts.namespace !== '_' && parts.namespace !== namespace) {
        return qname;
    }
    if (parts.pkg === packageName)
        return parts.name;
    return parts.pkg ? `${parts.pkg}/${parts.name}` : parts.name;
}
