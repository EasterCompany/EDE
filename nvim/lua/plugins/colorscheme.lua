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
      -- Force lualine to use the 'auto' theme which adapts to the terminal colors,
      -- and ensure we don't have hardcoded light colors for sections.
      opts.options = opts.options or {}
      opts.options.theme = "auto"
      
      -- Ensure section B/C backgrounds aren't forced to a light color
      -- This fixes the white background in the terminal/status info
      local custom_colors = {
        normal = {
          b = { bg = "NONE", fg = "NONE" },
          c = { bg = "NONE", fg = "NONE" },
        },
      }
      opts.options.theme = custom_colors
    end,
  },
}
