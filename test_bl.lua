vim.api.nvim_create_autocmd("User", {
  pattern = "EDEStarted",
  callback = function()
    local bl = require("bufferline")
    print(type(bl.setup))
    vim.cmd("qa!")
  end,
})
