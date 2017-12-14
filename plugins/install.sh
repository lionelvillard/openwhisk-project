#!/bin/bash

(cd core/wskp-combinator-plugin && npm install)
(cd core/wskp-web-plugin && npm install)
(cd core/wskp-package-plugin && npm install)
(cd core/wskp-swagger-plugin && npm install)
(cd core/wskp-wskprops-plugin && npm install)
(cd core/wskp-copy-plugin && npm install)

npm install