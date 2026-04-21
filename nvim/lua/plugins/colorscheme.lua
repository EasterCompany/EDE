return {
  -- Disable tokyonight and catppuccin as they override terminal colors
  { "folke/tokyonight.nvim", enabled = false },
  { "catppuccin/nvim", enabled = false },
  {
    "EasterCompany/EDE",
    opts = {
      colorscheme = "default",
    },
  },
  {
    "nvim-lualine/lualine.nvim",
    opts = function(_, opts)
      -- Use a theme that is strictly dark/black
      local custom_black = {
        normal = {
          a = { bg = "#000000", fg = "#ffffff", gui = "bold" },
          b = { bg = "#000000", fg = "#888888" },
          c = { bg = "#000000", fg = "#888888" },
        },
        insert = {
          a = { bg = "#000000", fg = "#ffffff", gui = "bold" },
          b = { bg = "#000000", fg = "#888888" },
        },
        visual = {
          a = { bg = "#000000", fg = "#ffffff", gui = "bold" },
          b = { bg = "#000000", fg = "#888888" },
        },
        replace = {
          a = { bg = "#000000", fg = "#ffffff", gui = "bold" },
          b = { bg = "#000000", fg = "#888888" },
        },
        inactive = {
          a = { bg = "#000000", fg = "#444444", gui = "bold" },
          b = { bg = "#000000", fg = "#444444" },
          c = { bg = "#000000", fg = "#444444" },
        },
      }
      
      opts.options = opts.options or {}
      opts.options.theme = custom_black
      opts.options.component_separators = { left = "", right = "" }
      opts.options.section_separators = { left = "", right = "" }
    end,
  },
}
