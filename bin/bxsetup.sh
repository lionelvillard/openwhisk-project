#!/usr/bin/env bash

if ! type bx > /dev/null; then
    # Install the Bluemix CLI for testing on the IBM cloud
    wget https://public.dhe.ibm.com/cloud/bluemix/cli/bluemix-cli/latest/Bluemix_CLI_amd64.tar.gz && \
    tar zxvf Bluemix_CLI_amd64.tar.gz && \
    cd Bluemix_CLI && \
    sudo ./install_bluemix_cli
fi

bx login -a https://api.ng.bluemix.net -s dev