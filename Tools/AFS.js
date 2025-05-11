function AppendFS(UserName, Text) {
  FileSystem.appendFile(`./node_modules/${UserName}.txt`, `${Text}`,
    function(Error) {
      if (Error) throw Error;
    });
}

module.exports = {
  appendFS: AppendFS(UserName, Text),
}