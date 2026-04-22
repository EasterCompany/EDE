return {
  -- Disable tokyonight and catppuccin as they override terminal colors
  { "folke/tokyonight.nvim", enabled = false },
  { "catppuccin/nvim", enabled = false },
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "default",
    },
  },
  {
    "nvim-lualine/lualine.nvim",
    opts = function(_, opts)
      -- Use a theme that is strictly transparent/black to fix Windows Terminal scaling
      local custom_black = {
        normal = {
          a = { bg = "NONE", fg = "#ffffff", gui = "bold" },
          b = { bg = "NONE", fg = "#888888" },
          c = { bg = "NONE", fg = "#888888" },
        },
        insert = {
          a = { bg = "NONE", fg = "#ffffff", gui = "bold" },
          b = { bg = "NONE", fg = "#888888" },
        },
        visual = {
          a = { bg = "NONE", fg = "#ffffff", gui = "bold" },
          b = { bg = "NONE", fg = "#888888" },
        },
        replace = {
          a = { bg = "NONE", fg = "#ffffff", gui = "bold" },
          b = { bg = "NONE", fg = "#888888" },
        },
        inactive = {
          a = { bg = "NONE", fg = "#444444", gui = "bold" },
          b = { bg = "NONE", fg = "#444444" },
          c = { bg = "NONE", fg = "#444444" },
        },
      }
      
      opts.options = opts.options or {}
      opts.options.theme = custom_black
      opts.options.component_separators = { left = "", right = "" }
      opts.options.section_separators = { left = "", right = "" }
    end,
  },
}
