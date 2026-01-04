import { Link } from "react-router-dom";
import { type Recipe } from "../lib/types";

export default function RecipeCard({
  recipe,
  coverUrl,
}: {
  recipe: Recipe;
  coverUrl?: string;
}) {
  return (
    <Link to={`/recipes/${recipe.id}`} className="card recipe-card" style={{ display: "block" }}>
      <div className="recipe-card-media">
        <img className="thumb" src={coverUrl || "/pwa-512.png"} alt="" />
        {recipe.is_favorite && <div className="favorite-badge">Favorite</div>}
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="h2">{recipe.title}</div>
        {recipe.tags.length > 0 && (
          <div className="muted small" style={{ marginTop: 6 }}>
            {recipe.tags.slice(0, 4).join(" · ")}
          </div>
        )}
      </div>
    </Link>
  );
}
