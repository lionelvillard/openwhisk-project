#!/bin/bash

(cd core/wskp-combinator-plugin && rm -rf node_modules && rm package-lock.json)
(cd core/wskp-web-plugin && rm -rf node_modules && rm package-lock.json) 
(cd core/wskp-zip-plugin && rm -rf node_modules && rm package-lock.json)  
(cd core/wskp-swagger-plugin && rm -rf node_modules && rm package-lock.json)  
(cd core/wskp-wskprops-plugin && rm -rf node_modules && rm package-lock.json) 
(cd core/wskp-copy-plugin && rm -rf node_modules && rm package-lock.json)  
 