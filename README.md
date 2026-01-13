# Hex / Path — Game Rules Overview

This is a shared-board, semi-collaborative strategy game built on a hex grid. Players place tiles or paths using multi-color cards to create scoring connections between origins and the outer rim. Strategy emerges from directional constraints, shared resources, and timing rather than direct destruction or hard blocking.

The game supports two closely related modes: **Hex Mode** and **Path Mode**.

---

## Core Concepts (Both Modes)

### Colors & Direction
- The game uses **six colors**: R, O, Y, G, B, V.
- Each color corresponds to a **fixed cardinal direction** on the hex grid.
- When you play a card, you must choose **exactly one color** from it.
- That chosen color determines **where and how** you may place a tile or path.

Cardinal directions may be **shuffled per game**, so color meaning is discovered and adapted to each play.

---

### Cards
- Cards contain **2–5 colors**.
- Playing a card lets you place **one tile or path** using one chosen color.
- Cards represent *options*, not fixed actions.

Players start with a **hand of 3 cards**.

---

### Turn Structure
On your turn, you may:
- Play **any number of cards** from your hand.
- Play **any number of cards** from the shared stash.
- Perform rotations when legal.
- Choose when to stop.

At the **end of your turn**, your hand refills to 3 cards.

There is no fixed “one action per turn” limit — tempo and opportunity cost are key strategic considerations.

---

### Shared Stash (“Treasure”)
- There are **3 public stash slots** shared by all players.
- On your turn, you may **stash a card** (place it into an empty slot).
- When you stash a card, you **immediately draw a replacement**.
- When all stash slots are full, no more cards can be stashed.

The stash is a **public commodity**:
- Anyone may play cards from it.
- Managing stash availability is a key strategic lever.
- Stashing trades tempo for flexibility and denial.

---

### Placement & Lanes
- Placements must obey **directional rules** tied to the chosen color.
- Multiple paths may occupy the same space using **lanes**:
  - Hex mode: up to 2 lanes
  - Path mode: up to 3 lanes
- Lanes enable **parallel connections** and support branching structures.

---

### Rotations
- Certain placements may be **rotated**:
  - Hexes can be rotated, changing their color-direction alignment.
  - Unconnected paths may rotate around their node.
- Rotations are only allowed if they **do not create an illegal placement**.
- Rotations are a tactical tool for redirection, alignment, and soft blocking.

---

### Blocking
Blocking is **soft and indirect**:
- You can obstruct by:
  - Forcing unfavorable direction choices
  - Occupying space
  - Rotating to misalign paths
- Blocks are usually **circumventable** by longer routes.
- Longer routes often score **more**, so blocking is situational.

---

### Semi-Collaborative Scoring
- When a scoring connection is created, **all players who qualify for that objective score**, not just the player who placed the final piece.
- This creates incentives to:
  - Advance shared structures
  - Time completion carefully
  - Exploit opponents’ objectives without fully helping them

---

## Hex Mode

### Board
- Hex grid of radius **6**
- Single origin at the center
- Hex tiles are placed

### Scoring
- Scoring occurs when a **continuous single-color path** connects:
  - origin → origin, or
  - origin → rim
- Score is based on:
  - **Shortest path**
  - **Rim touch**
  - **Origin-to-origin connectivity**
- Each player has **primary / secondary / tertiary colors**, scored with weights:
  - 3 / 2 / 1

Scoring happens **immediately** when the connection is completed.

### Strategy Feel
- Emphasizes spatial planning, routing efficiency, and timing.
- Blocking is temporary; path extension and rerouting are common.
- Rotation plays a strong positional role.

---

## Path Mode

### Board
- Smaller hex grid (radius **4**)
- Paths are placed directly (dot-to-dot style)
- Supports **branching (forks)**

### Fork Support Rule
- Branches must be **supported** by parallel same-color lanes back to the origin.
- Unsupported forks are illegal.
- This creates a strong structural constraint and a natural cost to branching.

### Scoring
- Experimental / evolving
- Currently focused on:
  - **Touching the destination origin or rim**
  - Intermediate segments may not score directly
- Color weights are symmetric: **1 / 1 / 1**

### Strategy Feel
- More tactical and timing-focused
- Heavier emphasis on lane capacity and support
- Strong race dynamics around destination contact

---

## Game End
- The game ends when the **deck is exhausted**.
- If enabled, all players receive **equal turns** after exhaustion.
- Final scores determine the winner.

---

## Design Philosophy
- No hard elimination.
- Blocking is pressure, not denial.
- Long paths are often better than short ones.
- Plans emerge from local decisions and shared incentives.
- Every rule exists to create *interesting tradeoffs*, not dead ends.