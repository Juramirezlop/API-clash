SELECT player_tag, SUM(season_points) as total
FROM season_points_weekly  
WHERE season_month = '2025-10'
GROUP BY player_tag
ORDER BY total DESC LIMIT 5;