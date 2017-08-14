#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

export BX_SPACE_CI=openwhisk-deploy-ci`uuidgen`

bx iam space-create ${BX_SPACE_CI}

#echo Wait 10 seconds
#sleep 10 # to make sure the OW keys gets initialized

(cd ${DIR}/.. && npm test)
(cd ${DIR}/../plugins/actions/combinator && npm test)

bx iam space-delete ${BX_SPACE_CI} -f