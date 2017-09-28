#!/bin/bash

(cd core/wskp-combinator-plugin && npm install && npm run tsc)
(cd core/wskp-web-plugin && npm install && npm run tsc) 
(cd core/wskp-zip-plugin && npm install && npm run tsc)  
(cd core/wskp-swagger-plugin && npm install && npm run tsc)  
(cd core/wskp-wskprops-plugin && npm install && npm run tsc) 
(cd core/wskp-copy-plugin && npm install && npm run tsc)  
 