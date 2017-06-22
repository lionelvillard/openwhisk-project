#!/usr/bin/env bash

#echo Install bx

#wget https://public.dhe.ibm.com/cloud/bluemix/cli/bluemix-cli/Bluemix_CLI_0.5.4_amd64.tar.gz
#cd Bluemix_CLI
#./install_bluemix_cli

echo npm install deployer
cd ${TRAVIS_BUILD_DIR}/libs/deployer
npm install

