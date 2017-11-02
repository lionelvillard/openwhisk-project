#!/bin/bash

(cd core/wskp-combinator-plugin && rm -rf node_modules package-lock.json dist)
(cd core/wskp-web-plugin && rm -rf node_modules package-lock.json dist)
(cd core/wskp-package-plugin && rm -rf node_modules package-lock.json dist)
(cd core/wskp-swagger-plugin && rm -rf node_modules package-lock.json dist)
(cd core/wskp-wskprops-plugin && rm -rf node_modules package-lock.json dist)
(cd core/wskp-copy-plugin && rm -rf node_modules package-lock.json dist)
