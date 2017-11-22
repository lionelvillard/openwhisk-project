#!/bin/bash

(cd core/wskp-combinator-plugin && npm run tsc)
(cd core/wskp-web-plugin && npm run tsc)
(cd core/wskp-package-plugin && npm run tsc)
(cd core/wskp-swagger-plugin && npm run tsc)
(cd core/wskp-wskprops-plugin && npm run tsc)
(cd core/wskp-copy-plugin && npm run tsc)
