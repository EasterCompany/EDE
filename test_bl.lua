vim.api.nvim_create_autocmd("User", {
  pattern = "LazyVimStarted",
  callback = function()
    local bl = require("bufferline")
    print(type(bl.setup))
    vim.cmd("qa!")
  end,
})
