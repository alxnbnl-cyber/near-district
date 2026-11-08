-- Districts renamed for the 2D city map (ids unchanged, so Space placement is unaffected).
UPDATE "world_districts" SET "name" = 'Northgate', "tagline" = 'Projects & products' WHERE "id" = 'discovery';
--> statement-breakpoint
UPDATE "world_districts" SET "name" = 'Old Quarter', "tagline" = 'Puzzles & treasure hunts' WHERE "id" = 'mystery';
--> statement-breakpoint
UPDATE "world_districts" SET "name" = 'Harbor Works', "tagline" = 'Creators & contests' WHERE "id" = 'creators';
--> statement-breakpoint
UPDATE "world_districts" SET "name" = 'Westfield', "tagline" = 'Communities & DAOs' WHERE "id" = 'community';
