const fs = require('fs');

fs.readdir("build/contracts", function (err, filenames) {
    filenames.forEach(filename => {
        if (filename.includes('.json')) {
            let fileJson = require('./build/contracts/' + filename).abi;
            let data = JSON.stringify({ abi: fileJson });
            fs.writeFile('./nerd.web/abi/contracts/' + filename, data, (err) => {
                if (err) throw err;
                console.log('Data written to file ' + filename);
            });
        }
    })
});
