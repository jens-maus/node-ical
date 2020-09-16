#!/bin/bash
# get the json lookup file from xml file on npm install, only used if windows timezones are encountered
#  set filename
fn=windowsZones.xml
#  download unicode.org supported  list of windows/iana timezone mappings
curl -sL https://raw.githubusercontent.com/unicode-org/cldr/master/common/supplemental/$fn >$fn
res=$?
if [ $res -eq 0 ]; then
	# convert to json
	node node_modules/xml-js/bin/cli.js $fn >$(basename $fn .xml).json
	# erase xml file
	rm $fn
	node cvt-to-json.js
fi
