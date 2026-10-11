-- 项目任务总览：顶栏、审核页和导出页共用
SELECT p.id AS project_id, t.type, t.status, COUNT(*) AS task_count,
       ROUND(COALESCE(SUM(v.cost), 0), 2) AS actual_cost
FROM projects p
LEFT JOIN tasks t ON t.project_id = p.id
LEFT JOIN task_versions v ON v.id = t.current_version_id
WHERE p.id = :project_id
GROUP BY t.type, t.status ORDER BY t.type, t.status;
