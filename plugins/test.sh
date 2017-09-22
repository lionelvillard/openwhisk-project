#!/bin/bash

(cd core/wskp-combinator-plugin && NODE_TLS_REJECT_UNAUTHORIZED=0 npm test)
(cd core/wskp-swagger-plugin && NODE_TLS_REJECT_UNAUTHORIZED=0 npm test)
(cd core/wskp-web-plugin && NODE_TLS_REJECT_UNAUTHORIZED=0 npm test)
#(cd wskp-zip-plugin && NODE_TLS_REJECT_UNAUTHORIZED=0 npm test)
  